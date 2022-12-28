
/*

Runs a genetic algorithmm controlled by the following options and callbacks

    opts.populationSize      initial population size
    opts.random()            callback to generate a random individual
    opts.fitness(indvidual)  callback to evaluate fitness of an individual
    opts.fitnessSign         -1 for lower fitness better, 1 for higher fitness better
    opts.terminate(ga)       callback to query whether to continue
    opts.generate(ga)        callback to generate the next population

`ga` is a context that stores the current state of the run

    ga.genCount              current generation number
    ga.population[]          the current population
    ga.opts{}                as passed to run_ga
    ga.fitness               current best fitness

Each entry in the population is stored as:
 
    entry.individual         what ever the callbacks provide as an individual
    entry.fitness            the evaluated fitness of this individual

An individual can be any javascript value (object, array, string, etc...) so 
long as all your callbacks work with/expect the same thing.

Returns `ga` when finished.

*/
export function run_ga(opts)
{
    // Setup the run context
    let ga = {
        genCount: 0,
        population: [],
        opts: opts
    };

    // Generate starting random population
    for (let i=0; i<opts.populationSize; i++)
    {
        ga.population.push({ individual: opts.random() });
    }

    // Process generations
    while (true)
    {
        // Bump generation number
        ga.genCount++;

        // Calculate fitness of population
        for (let e of ga.population)
        {
            e.age = (e.age ?? 0) + 1;
            if (e.fitness === undefined)
            {
                e.fitness = opts.fitness(e.individual);
            }
        }

        // Sort fitest first
        ga.population.sort((a,b) => Math.sign(b.fitness - a.fitness) * opts.fitnessSign);

        // Store best fitness
        ga.fitness = ga.population[0].fitness;
        
        // Terminate?
        if (opts.terminate(ga))
            break;

        // Generate next population
        ga.population = opts.generate(ga);
    }

    // Return the fittest
    return ga;
}

/*
Creates a termination function that will terminate on the following conditions:

    opts.minGenerations               always run at least this many generations
    opts.maxGenerations               always stop after this many generations
    opts.maxGenerationsNoImprovement  stop after this many generations of no improvement
    opts.fitness                      terminate when fitness level reached
*/
export function make_terminate(opts)
{
    let gen = 0;
    let bestFitness = null;
    let bestFitnessGenerations = 0;
    return function(ga)
    {
        // Min generation check
        if (opts.minGenerations && ga.genCount < opts.minGenerations)
            return false;

        // Max generation check
        if (opts.maxGenerations && ga.genCount >= opts.maxGenerations)
            return true;

        // Max generations with no improvement to fitness check
        if (opts.maxNoImprovementGenerations)
        {
            // Stop after N generations of no improvment to fitness
            let fitness = ga.fitness * ga.ops.fitnessSign;
            if (bestFitness == null || fitness > bestFitness)
            {
                bestFitness = fitness;
                bestFitnessGenerations = 0;
            }
            else
            {
                bestFitnessGenerations++;
                if (bestFitnessGenerations >= opts.maxNoImprovementGenerations)
                    return true;
            }
        }

        // Reached required fitness check
        if (opts.fitness)
        {
            if (ga.opts.fitnessSign < 0)
            {
                if (ga.fitness < opts.fitness)
                    return true;
            }
            else
            {
                if (ga.fitness > opts.fitness)
                    return true;
            }
        }

        return false;
    }
}

/* 
Create a generator functiom that will populate new generations based on specified criteria:

    opts.fitest             keep this many of the most fitest individuals
    opts.cross              generate this many new individuals by crossing ("mating") individuals from
                            the previous generation
    opts.crosser(ga, a, b)  callback to generate a new individual by crossing parent individuals 'a' 
                            and 'b'
    opts.mutate             generate this many new individuals by mutating individuals from the previous
                            generation
    opts.mutator(ga, a)     callback to mutate indivadual 'a'
    opts.random             randomly generate this many new individuals using the random callback passed 
                            to run_ga()
    opts.select(ga)         callback to randomly select an individual from the population (used to select
                            the individuals to be used for for cross and mutate operations)
*/
export function make_generator(opts)
{
    return function generate(ga)
    {
        let newPop = [];

        // Keep fitest
        for (let i=0; i<opts.fitest; i++)
        {
            newPop.push(ga.population[i]);
        }

        // Cross
        for (let i=0; i<opts.cross; i++)
        {
            newPop.push({ 
                individual: opts.crosser(ga, opts.select(ga).individual, opts.select(ga).individual) 
            });
        }

        // Mutate 
        for (let i=0; i<opts.mutate; i++)
        {
            newPop.push({ 
                individual: opts.mutator(ga, opts.select(ga).individual) 
            });
        }

        // Generate random entries
        for (let i=0; i<opts.random; i++)
        {
            newPop.push({ individual: ga.opts.random() });
        }

        return newPop;
    }
}

/*
Randomly selects an individual from existing population
*/
export function select_random(ga)
{
    return ga.population[Math.floor(Math.random() * ga.population.length)]
}

/*
Makes a ranked random selection from prior generation that's more likely
to select a fitter individual.  `bias` controls the strength of the favortism.
*/
export function make_select_ranked(bias)
{
    return function (ga)
    {
        let index = Math.floor(ga.population.length * (bias - Math.sqrt(bias*bias - 4.0*(bias-1) * Math.random()))  / 2.0 / (bias-1));
        return ga.population[index]; 
    }
}

/*
//Simple usage example that tries to find the center of a 1x1 rectangle.

let r = run_ga({
    populationSize: 15,
    random: () => ({ x: Math.random(), y: Math.random() }),
    fitness: (i) => {
        let dx = i.x - 0.5;
        let dy = i.y - 0.5;
        return Math.sqrt(dx * dx + dy * dy);
    },
    fitnessSign: -1,
    terminate: make_terminate({
        fitness: 0.001,
    }),
    generate: make_generator({ 
        fitest: 1,
        random: 2, 
        mutate: 6,
        cross: 6,
        mutator: (ga, i) => {
            // Cheat: as the overall fitness improves, make smaller mutations
            let fitness = ga.fitness;
            return {
                x: i.x + Math.random() * fitness * 2 - fitness,
                y: i.y + Math.random() * fitness * 2 - fitness,
            }
        },
        crosser: (ga, a, b) => {
            if (Math.random() < 0.5)
                return { x: a.x, y: b.y }
            else
                return { x: b.x, y: a.y }
        },
        select: make_select_ranked(1.5),
    }),
});

console.log(JSON.stringify({ genCount: r.genCount, fitest: r.population[0] }, null, 2));
*/