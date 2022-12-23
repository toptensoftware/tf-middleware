import { Point, Rectangle, Region } from '@toptensoftware/jslib';
import * as ga from './ga.js';

function object_contains_pose(object, pose)
{
    let r = Rectangle.fromObject(object.rect);
    return r.containsPoint(pose.keypoints.nose.position) &&
            r.containsPoint(pose.keypoints.leftEye.position) &&
            r.containsPoint(pose.keypoints.rightEye.position);
}

let object_weights = {
    // Faces from posenet and people from object detector get highest weight
    'face': 1,
    'person': 0.99,

    // People with their birthday cake
    'cake': 0.95,

    // Pet-animals
    'cat': 0.9,
    'dog': 0.9,
    'teddy bear': 0.9,

    // Other animals
    'bird': 0.8,
    'horse': 0.8,
    'sheep': 0.8,
    'cow': 0.8,
    'elephant': 0.8,
    'bear': 0.8,
    'zebra': 0.8,
    'giraffe': 0.8,

    // Things people might pose with
    'bicycle': 0.6,
    'car': 0.6,
    'motorcycle': 0.6,
    'boat': 0.6,
    'skis': 0.6,
    'snowboard': 0.6,
    'sports ball': 0.6,
    'kite': 0.6,
    'baseball bat': 0.6,
    'baseball glove': 0.6,
    'skateboard': 0.6,
    'surfboard': 0.6,
    'tennis racket': 0.6,
    'frisbee': 0.6,

    // Things that are interesting but
    // might be large and we don't 
    // want them to dominate
    'airplane': 0.4,
    'bus': 0.4,
    'train': 0.4,
    'truck': 0.4,

    // Boring, give little weight to these
    'traffic light': 0.05,
    'fire hydrant': 0.05,
    'stop sign': 0.05,
    'parking meter': 0.05,
    'bench': 0.05,
    'backpack': 0.05,
    'umbrella': 0.05,
    'handbag': 0.05,
    'tie': 0.05,
    'suitcase': 0.05,
    'bottle': 0.05,
    'wine glass': 0.05,
    'cup': 0.05,
    'fork': 0.05,
    'knife': 0.05,
    'spoon': 0.05,
    'bowl': 0.05,
    'banana': 0.05,
    'apple': 0.05,
    'sandwich': 0.05,
    'orange': 0.05,
    'broccoli': 0.05,
    'carrot': 0.05,
    'hot dog': 0.05,
    'pizza': 0.05,
    'donut': 0.05,
    'chair': 0.05,
    'couch': 0.05,
    'potted plant': 0.05,
    'bed': 0.05,
    'dining table': 0.05,
    'toilet': 0.05,
    'tv': 0.05,
    'laptop': 0.05,
    'mouse': 0.05,
    'remote': 0.05,
    'keyboard': 0.05,
    'cell phone': 0.05,
    'microwave': 0.05,
    'oven': 0.05,
    'toaster': 0.05,
    'sink': 0.05,
    'refrigerator': 0.05,
    'book': 0.05,
    'clock': 0.05,
    'vase': 0.05,
    'scissors': 0.05,
    'hair drier': 0.05,
    'toothbrush': 0.05,
}

// options.aspect - aspect ratio of the generate rectangles
// options.posenet - results of posenet detection
// options.cocossd - results of object detection
export function areasOfInterest(results, options)
{
    let objects = results.cocossd.objects;
    let poses = results.posenet.poses;

    let start = Date.now();

    // Generate an importance factor for each pose's face triangle
    let totalImpWeight = 0;
    for (let pose of poses)
    {
        if (pose.keypoints.nose && pose.keypoints.leftEye && pose.keypoints.rightEye)
        {
            // Work out perimeter
            let perimeter = 
                Point.distance(pose.keypoints.nose.position, pose.keypoints.leftEye.position) + 
                Point.distance(pose.keypoints.leftEye.position, pose.keypoints.rightEye.position) + 
                Point.distance(pose.keypoints.rightEye.position, pose.keypoints.nose.position);

            // Work out importance weighting
            pose.impWeight = perimeter * (pose.keypoints.nose.score + pose.keypoints.leftEye.score + pose.keypoints.rightEye.score);
            totalImpWeight += pose.impWeight;
        }
        else
        {
            pose.impWeight = 0;
        }
    }
    if (totalImpWeight)
    {
        for (let pose of poses)
        {
            if (pose.impWeight !== undefined)
            {
                pose.importance = pose.impWeight / totalImpWeight;
                delete pose.impWeight;
            }                
        }
    }
    
    // Find closest pose
    let mostImportant = null;
    for (let pose of poses)
    {
        if (pose.keypoints.nose && pose.keypoints.leftEye && pose.keypoints.rightEye)
        {
            pose.facePos = new Point(
                (pose.keypoints.nose.position.x + pose.keypoints.leftEye.position.x + pose.keypoints.rightEye.position.x) / 3,
                (pose.keypoints.nose.position.y + pose.keypoints.leftEye.position.y + pose.keypoints.rightEye.position.y) / 3,
            );
            pose.faceScore = (pose.keypoints.nose.score + pose.keypoints.leftEye.score + pose.keypoints.rightEye.score) / 3;
        }

        if (mostImportant == null || pose.importance > mostImportant)
        {
            mostImportant = pose.importance;
        }
    }

    // Filter out poses of people in background
    poses.filter(p => p.importance >= mostImportant / 2);

    // Connect people objects with poses
    for (let pose of poses)
    {
        for (let o of objects)
        {
            if (o.class == 'person' && object_contains_pose(o, pose))
            {
                let person = o;
                if (person.pose)
                {
                    // Object already matched to another pose, work out 
                    // which is better based on intersection area
                    let i1 = Rectangle.fromObject(person.rect).intersection(pose.bounds);
                    if (!i1)
                        continue;
                    let i2 = Rectangle.fromObject(person.rect).intersection(person.pose.bounds);
                    if (i2 && i1.width * i1.height < i2.width * i2.height)
                    {
                        continue;
                    }

                    // Disconnect pose from old person
                    delete person.pose.person;
                }

                // Connect person and pose
                person.pose = pose;
                pose.person = person;
            }
        }
    }

    // Work out the total weighted area
    let totalWeightedArea = 0;
    for (let o of objects)
    {
        let weight = object_weights[o.class] * o.score;
        totalWeightedArea += o.rect.width * o.rect.height * weight;
    }

    // Filter out people with no associated pose
    objects = objects.filter(x => x.class != 'person' || x.pose != null);
    poses = poses.filter(x => x.person != null);

    // Calculate the fitness of a rectangle
    function fitness(rect)
    {
        // Map faces to rule of thirds
        let faceAlignScore = 0;
        for (let p of poses)
        {
            if (p.facePos && rect.containsPoint(p.facePos))
            {
                let rotDistance1 = Point.distance(p.facePos, new Point(rect.x + rect.width / 3, rect.y + rect.height / 3));
                let rotDistance2 = Point.distance(p.facePos, new Point(rect.x + rect.width * 2 / 3, rect.y + rect.height / 3));
                let rotFitness = 1 - Math.min(rotDistance1, rotDistance2);
                if (rotFitness < 0)
                    rotFitness = 0;
                faceAlignScore += rotFitness * p.importance;
            }
        }

        // Add weighted objects
        let areaScore = 0;
        let unusedRegion = new Region();
        unusedRegion.add(rect);
        for (let o of objects)
        {
            // Get intersection
            let isect = Rectangle.fromObject(o.rect).intersection(rect);
            if (isect == null)
                continue;

            // Subtract it from the used region
            unusedRegion.subtract(isect);

            // Work out weighted area
            let weight = object_weights[o.class] * o.score;
            let weightedArea =  (isect.width * isect.height) * weight;

            // Increase fitness by percentage of area that intersects
            areaScore += weightedArea / totalWeightedArea;
        }

        // Work out the proportion of the original rectangle that
        // has been used.
        let totalArea = rect.width * rect.height;
        let utilScore = (totalArea - unusedRegion.area) / totalArea;

        return (
            areaScore * 1.0 + 
            faceAlignScore * 1.3 + 
            utilScore * 0.1
        );
    }

    // Find where the actual image is inside the img tag
    // Normalize the requested aspect ratio
    let width = results.posenet.width;
    let height = results.posenet.height;
    let normalAspect = options.aspect * height / width;


    function find_fittest_rect(rect, minScale, maxScale)
    {
        // Run genetic algorithm to find best placement
        let r = ga.run_ga({
            populationSize: 15,
            random: function() { 
                let scale = minScale+ (Math.random() * (maxScale - minScale));
                let width = rect.width * scale;
                let height = rect.height * scale;
                return new Rectangle(
                    Math.random() * (1 - width), 
                    Math.random() * (1 - height),
                    width,
                    height,
                );
            },
            fitness: fitness,
            fitnessSign: 1,
            terminate: ga.make_terminate({
                maxGenerations: 40
            }),
            generate: ga.make_generator({ 
                fitest: 3,
                random: 3, 
                mutate: 14,
                cross: 0,
                mutator: (ga, i) => {
                    // Mutate by shifting one pixel
                    let scale = (Math.random() * 0.2) - 0.1;
                    let mutated = new Rectangle(
                        i.x + Math.random() * (2 / width) - 1/width,
                        i.y + Math.random() * (2 / height) - 1/height,
                        i.width,
                        i.height
                    ).scale(scale);
                    if (mutated.width > rect.width * maxScale)
                    {
                        mutated.width = rect.width * maxScale;
                        mutated.height = rect.height * maxScale;
                    }
                    else if (mutated.width < rect.width * minScale)
                    {
                        mutated.width = rect.width * minScale;
                        mutated.height = rect.height * minScale;
                    }
                    if (mutated.x < 0)
                        mutated.x = 0;
                    if (mutated.y < 0)
                        mutated.y = 0;
                    if (mutated.x > (1 - mutated.width))
                        mutated.x = (1 - mutated.width);
                    if (mutated.y > (1 - mutated.height))
                        mutated.y = (1 - mutated.height);
                    return mutated;
                },
                select: ga.make_select_ranked(1.5),
            }),
        });

        return r.population[0].individual;
    }
        
    // Find fittest rectangles
    let max_rect = new Rectangle(0,0,1,1).contain(normalAspect);
    let rect1 = find_fittest_rect(max_rect, 0.5, 0.70);
    let rect2 = find_fittest_rect(max_rect, 0.8, 1);

    // Clean up
    for (let pose of poses)
    {
        if (pose.person)
        {
            pose.personIndex = objects.indexOf(pose.person);
            delete pose.person;
        }
    }
    for (let object of objects)
    {
        if (object.pose)
        {
            object.poseIndex = poses.indexOf(object.pose);
            delete object.pose;
        }
    }

    // Return results
    return { 
        elapsed: Date.now() - start, 
        rect1, 
        rect2 
    }


}