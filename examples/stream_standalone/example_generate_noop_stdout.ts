import exthos from "../../src/index.js" // exthos;


let stream = new exthos.Stream({
    input: {generate: {mapping: `root = "you nailed it"`}},
    pipeline: {
        processors: [{noop: {}}]
    },
    output: {stdout: {}}
}, true)
