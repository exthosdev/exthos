import * as exthos from "../../dist/index.js";
let stream = new exthos.Stream({
    input: { generate: { mapping: `root = "hi"`, count: 2 } },
    pipeline: {
        processors: [{ log: {message: 'logger here :)'} }]
    },
    output: { stdout: {} }
});
stream.start();
