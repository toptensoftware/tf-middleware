import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import asyncHandler from 'express-async-handler';
import tf from '@tensorflow/tfjs-node';
import cocoSsd from '@tensorflow-models/coco-ssd';
import posenet from '@tensorflow-models/posenet';
import tfModelCache from './tfModelCache.js';
import fetch from 'node-fetch';
import { existsAsync } from '@toptensoftware/nodelib';

// Install model cache
tfModelCache({});

export function tfMiddleware(options) {
    
    let load_models_promise;
    let model_cocoSsd;
    let model_posenet;
    async function loadModels()
    {
        if (!load_models_promise)
        {
            load_models_promise = (async function() {
                console.log("Loading cocoSsd...");
                model_cocoSsd = await cocoSsd.load(Object.assign({
                    base: "mobilenet_v2",
                }, options?.cocossdOptions ?? {}));
                
                console.log("Loading posenet...");
                model_posenet = await posenet.load(Object.assign({
                    architecture: 'ResNet50',
                    outputStride: 32,
                    inputResolution: 512,
                    quantBytes: 2
                }, options?.posenetOptions?? {}));
                
                console.log("Models loaded.");
            })();
        }
        return load_models_promise;
    }


    async function run_cocossd(img)
    {
        let width = img.shape[1];
        let height = img.shape[0];

        // Detect
        let start = Date.now();
        let results = await model_cocoSsd.detect(img);
        let elapsed = Date.now() - start;

        // Convert to public format
        return {
            objects: results.map(x => ({
                class: x.class,
                score: x.score,
                rect: {
                    x: x.bbox[0] / width,
                    y: x.bbox[1] / height,
                    width: x.bbox[2] / width,
                    height: x.bbox[3] / height,
                },
            })),
            elapsed,
        };
    }

    async function run_posenet(img)
    {
        let width = img.shape[1];
        let height = img.shape[0];

        // Detect
        let start = Date.now();
        let results = await model_posenet.estimateMultiplePoses(img, Object.assign({
            flipHorizontal: false,
            maxDetections: 5,
            scoreThreshold: 0.5,
            nmsRadius: 20
        }, options.posenetOptions));
        let elapsed = Date.now() - start;

        // Fetch skeletons
        for (let pose of results)
        {
            pose.skeleton = posenet.getAdjacentKeyPoints(pose.keypoints, 0.5)
                .map(keypoints => keypoints.map(x => x.part));
        }

        // Normalize keypoints
        for (let pose of results)
        {
            let newKeyPoints = {};
            for (let kp of pose.keypoints)
            {
                kp.position.x /= width;
                kp.position.y /= height;
                newKeyPoints[kp.part] = {
                    score: kp.score,
                    position: kp.position,
                }
            }
            pose.keypoints = newKeyPoints;
        }

        return {
            poses: results,
            elapsed, 
        }
    }


    return asyncHandler(async (req, res) => {
   
        // Work out cache directory and make sure exists
        let cache_dir = path.join(options?.cacheDir ?? os.tmpdir(), "tf-data-cache");
        if (!await existsAsync(cache_dir))
        {
            await fs.mkdir(cache_dir);
        }

        // Work out cache file
        let hash = crypto.createHash('sha256').update(req.query.url).digest('hex');
        let cache_file = path.join(cache_dir, hash);

        // Read cache file
        let result;
        try
        {
            if (req.query.read_cache != '0')
                result = JSON.parse(await fs.readFile(cache_file, 'utf8'));
        }
        catch { /* don't care */ }

        // Fetch the image
        let response = await fetch(req.query.url, { 
            method: "GET",
            headers: { 
                'If-None-Match': result?.etag
            },
        });

        // Modified?
        if (response.status != 304)
        {        
            // Read and decode image data
            let bytes = await response.arrayBuffer();
            let img = tf.node.decodeImage(new Uint8Array(bytes));

            // Make sure models are loaded
            await loadModels();

            // Generate results
            let width = img.shape[1];
            let height = img.shape[0];
            let results = await Promise.all([ 
                run_cocossd(img), 
                run_posenet(img) 
            ]);

            result = {
                apiver: 1,
                etag: response.headers.get('etag'),
                width,
                height,
                cocossd: results[0],
                posenet: results[1],
            }

            // Save to cache file
            if (req.query.write_cache != '0')
                await fs.writeFile(cache_file, JSON.stringify(result));

            result.cacheHit = false;
        }
        else
        {
            result.cacheHit = true;
        }

        // Setup unsaved stuff
        result.url = req.query.url;

        // Done
        return res.json(result);
    });
};

