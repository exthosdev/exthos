import * as exthos from "../../dist/index.js";
let stream = new exthos.Stream({
    input: {
        broker: {
            inputs: [
                { generate: { mapping: `root = "hi"`, count: 2 } }
            ]
        },
        processors: [
            {
                label: "____LABEL_input.processors.log",
                log: { message: 'input.processors.log here :)' }
            }
        ]
    },
    pipeline: {
        processors: [
            {
                branch: {
                    processors: [
                        { log: { message: 'pipeline.processors.branch.processors.log here :)' } }
                    ]
                }
            }

        ]
    },
    output: { stdout: {} }
})
stream.start();
