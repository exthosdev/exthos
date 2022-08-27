import * as exthos from "../../dist/index.js";

let stream = new exthos.Stream({
    input: { stdin: {} },
    output: { stdout: {} }
}, true);

setTimeout(() => {
    stream.stop()
}, 1000);