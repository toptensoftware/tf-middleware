import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import asyncHandler from 'express-async-handler';
import tf from '@tensorflow/tfjs-node';
import tfModelCache from './tfModelCache.js';
import fetch from 'node-fetch';
import { existsAsync } from '@toptensoftware/nodelib';
import { run_posenet } from './model_posenet.js';
import { run_cocossd } from './model_cocossd.js';
import { areasOfInterest } from './areasOfInterest.js';

// Install model cache
tfModelCache({});

async function run_model(model, options, url, loader)
{
    // Work out cache directory and make sure exists
    let cache_dir = path.join(options?.cacheDir ?? os.tmpdir(), "tf-data-cache");
    if (!await existsAsync(cache_dir))
    {
        await fs.mkdir(cache_dir);
    }

    // Work out cache file
    let hash = crypto.createHash('sha256').update(model.name + '\n' + url + '\n' + JSON.stringify(options ?? "")).digest('hex');
    let cache_file = path.join(cache_dir, hash);

    // Try to read cache file
    let result;
    try
    {
        result = JSON.parse(await fs.readFile(cache_file, 'utf8'));
    }
    catch { /* don't care */ }

    // Fetch the image, quit if not modified
    let load = await loader(url, result?.etag);
    if (load.notModified)
    {
        return result;
    }

    // Call model
    result = await model(load.img, options);
    result.etag = load.etag;

    // Write to cache
    await fs.writeFile(cache_file, JSON.stringify(result));

    // Return result
    return result;
}

export function tfMiddleware(options) {
    
    return asyncHandler(async (req, res) => {
   
        let response;
        let requested_etag;
        let img;
        async function image_loader(url, etag)
        {
            if (!response)
            {
                // First load request
                requested_etag = etag;
                response = await fetch(url, { 
                    method: "GET",
                    headers: { 
                        'If-None-Match': etag
                    },
                });
            }

            // Unmodified?
            if (response.status == 304 && etag == requested_etag)
            {
                return {
                    notModified: true
                };
            }

            // Image loaded?
            if (!img)
            {
                // If we previously got a 304, but this request is different
                // etag, we need to start the request again
                if (response.status == 304)
                {
                    response = await fetch(url, { 
                        method: "GET",
                        headers: { 
                        },
                    });    
                }
                
                let bytes = await response.arrayBuffer();
                img = tf.node.decodeImage(new Uint8Array(bytes));
            }
                
            return { img,  etag: response.headers.get('etag')};
        };


        let results = {
            url: req.query.url,
            apiver: 1,
        };

        // Run models
        if (req.query.posenet == '1' || req.query.interest == '1')
        {
            results.posenet = await run_model(run_posenet, {}, req.query.url, image_loader);
        }
        if (req.query.cocossd == '1' || req.query.interest == '1')
        {
            results.cocossd = await run_model(run_cocossd, {}, req.query.url, image_loader);
        }

        // Run interest calculation
        if (req.query.interest == '1')
        {
            results.interest = areasOfInterest(results, { aspect: 4/3 });
        }


        // Clean up stuff not asked for
        if (req.query.posenet != '1')
            delete results.posenet;
        if (req.query.cocossd != '1')
            delete results.cocossd;

        return res.json(results);
    });
};

