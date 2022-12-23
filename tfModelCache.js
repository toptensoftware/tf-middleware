import fs from 'fs/promises';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import url from 'url';
import download from 'download';
import tfc from '@tensorflow/tfjs-core';
import tf from '@tensorflow/tfjs-node';

// Async check if path exists
async function exists(path)
{
    try
    {
        await fs.stat(path);
        return true;
    }
    catch
    {
        return false;
    }
}


export default function tfModelCache(options)
{
    // Use temp dir if not specified
    if (!options.baseDir)
        options.baseDir = path.join(os.tmpdir(), "tf-model-cache");

    // Work out the base directory to store a model in based on
    // its URL
    function model_cache_dir(url)
    {
        let hash = crypto.createHash('sha256').update(url).digest('hex');
        return path.join(options.baseDir, hash);
    }
    
    // Register load router
    tfc.io.registerLoadRouter(function(urllike, options) {
        
        // Http?
        if (urllike.startsWith("http://") || urllike.startsWith("https://"))
        {
            return {
                load: async function()
                {
                    let dir = model_cache_dir(urllike);
                    let urlparts = url.parse(urllike);
                    let filename = path.basename(urlparts.path);
                    let modelFile = path.join(dir, filename);
    
                    if (!await exists(dir))
                    {
                        // Make the model directory
                        await fs.mkdir(dir, { recursive: true });
    
    
                        function relurl(filename)
                        {
                            let p =  path.join(path.dirname(urlparts.path), filename).replace(/\\/g, '/');
                            p =  urlparts.protocol + '//' + urlparts.host + p;
                            return p;
                        }
    
                        // Download
                        console.log(`Downloading ${urllike}`);
                        await download(urllike, dir);
    
                        // Load it
                        let json = JSON.parse(await fs.readFile(modelFile))
    
                        // Download weight manifest files
                        if (json.weightsManifest)
                        {
                            for (let wm of json.weightsManifest)
                            {
                                if (wm.paths)
                                {
                                    await Promise.all(wm.paths.map(x => download(relurl(x), dir)));
                                }
                            }
    
                        }
                    }
                    return tf.io.fileSystem(modelFile).load()
                }
            }        
        }
    
        return null;
    });
    
}