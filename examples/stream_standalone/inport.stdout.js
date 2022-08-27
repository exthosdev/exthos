import * as exthos from "../../dist/index.js";

let stream = new exthos.Stream({
    input: { inport: {} },
    output: { stdout: {} }
}, true);

stream.inPort.send("this is the end of the world!");

setTimeout(() => {
    stream.stop()
}, 2000);
