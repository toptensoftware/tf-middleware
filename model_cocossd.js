import cocoSsd from '@tensorflow-models/coco-ssd';
import { AsyncInstanceMap } from "@toptensoftware/jslib";

let model_map = new AsyncInstanceMap(function(key) {
    return cocoSsd.load(Object.assign({
        base: "mobilenet_v2",
    }, key));
});

export async function run_cocossd(img, options)
{
    // Get posenet model
    let model = await model_map.get(options);

    // Detect
    let start = Date.now();
    let results = await model.detect(img);
    let elapsed = Date.now() - start;

    // Normalize coordinates
    let width = img.shape[1];
    let height = img.shape[0];
    let objects = results.map(x => ({
        class: x.class,
        score: x.score,
        rect: {
            x: x.bbox[0] / width,
            y: x.bbox[1] / height,
            width: x.bbox[2] / width,
            height: x.bbox[3] / height,
        },
    }));

    return {
        width,
        height,
        options,
        elapsed, 
        objects,
    };
}
