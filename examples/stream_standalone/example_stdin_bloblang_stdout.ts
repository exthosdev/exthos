import exthos from "../../src/index.js";


let stream = new exthos.Stream({
    input: {stdin: {}},
    pipeline: {
        processors: [
            {bloblang: `root = "hello > content()"`}
        ]
    },
    output: {stdout: {}}
}, true)
