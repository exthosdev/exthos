import * as exthos from "../../dist/index.js";

let stream = new exthos.Stream({
    input: { generate: { mapping: `root = "am only going to talk twice"`, count: 10 } },
    output: { stdout: {} }
});

setTimeout(() => {
    stream.stop();
}, 2000);

await stream.start();

