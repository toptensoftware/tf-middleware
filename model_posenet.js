import posenet from '@tensorflow-models/posenet';
import { AsyncInstanceMap } from "@toptensoftware/jslib";

let model_map = new AsyncInstanceMap(function(key) {
    return posenet.load(Object.assign({
        architecture: 'ResNet50',
        outputStride: 32,
        inputResolution: 512,
        quantBytes: 2
    }, key));
});

export async function run_posenet(img, options)
{
    // Get posenet model
    let model = await model_map.get(options);

    // Detect
    let start = Date.now();
    let poses = await model.estimateMultiplePoses(img, Object.assign({
        flipHorizontal: false,
        maxDetections: 5,
        scoreThreshold: 0.5,
        nmsRadius: 20
    }, options));
    let elapsed = Date.now() - start;

    // Fetch skeletons
    for (let pose of poses)
    {
        pose.skeleton = posenet.getAdjacentKeyPoints(pose.keypoints, 0.5)
            .map(keypoints => keypoints.map(x => x.part));
    }

    // Normalize coordinates
    let width = img.shape[1];
    let height = img.shape[0];
    for (let pose of poses)
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
        width,
        height,
        options,
        elapsed, 
        poses,
    }
}
