// opts.populationSize - initial population size
// opts.random() - generate a random individual
// opts.fitness(indvidual) - evaluate fitness of an individual
// opts.fitnessSign - -1 for lower fitness better, 1 for higher fitness better
// opts.terminate(ga) - query whether to continue
// opts.generate(ga) - query whether to continue

// ga.genCount - current generation number
// ga.population - the current population
// ga.opts - as passed to run_ga
// ga.fitness - current best fitness

export function run_ga(opts)
{
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
        
        // Early break out?
        if (opts.terminate(ga))
            break;

        // Generate next population
        ga.population = opts.generate(ga);
    }

    // Return the fittest
    return ga;
}

// Creates a termination function that will terminate on the following conditions:
//  - opts.maxGenerations - always stop after this many generations
//  - opts.maxGenerationsNoImprovement - stop after this many generations of no improvement
//  - opts.fitness - terminate when fitness level reached
export function make_terminate(opts)
{
    let gen = 0;
    let bestFitness = null;
    let bestFitnessGenerations = 0;
    return function(ga)
    {
        if (opts.minGenerations && ga.genCount < opts.minGenerations)
            return false;

        if (opts.maxGenerations && ga.genCount >= opts.maxGenerations)
            return true;

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

export function select_random(ga)
{
    return ga.population[Math.floor(Math.random() * ga.population.length)]
}

export function make_select_ranked(bias)
{
    return function (ga)
    {
        let index = Math.floor(ga.population.length * (bias - Math.sqrt(bias*bias - 4.0*(bias-1) * Math.random()))  / 2.0 / (bias-1));
        return ga.population[index]; 
    }
}

/*
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