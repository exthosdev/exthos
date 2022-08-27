import * as exthos from "../../dist/index.js";

let stream = new exthos.Stream({
    input: { generate: { mapping: `root = "you nailed it"`, count: 2 } },
    pipeline: {
        processors: [{ noop: {} }]
    },
    output: { stdout: {} }
}, true);
