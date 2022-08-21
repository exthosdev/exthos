import exthos from "../../src/index.js";
let stream = new exthos.Stream({
    input: { inport: {} },
    output: { stdout: {} }
}, true);
stream.inPort.end("end of the world!");
