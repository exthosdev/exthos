import * as exthos from "../../dist/index.js";

let stream = new exthos.Stream({
    input: { inport: {} },
    pipeline: {
        processors: [
            { bloblang: `root = "hello > " + content()` }
        ]
    },
    output: { stdout: {} }
}, true);

stream.inPort.send("my msg1 to the world");
stream.inPort.send("my msg2 to the world");

setTimeout(() => {
    stream.stop()
}, 2000);