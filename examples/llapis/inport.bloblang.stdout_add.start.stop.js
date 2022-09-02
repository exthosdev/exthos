import * as exthos from "../../dist/index.js";

let engine = new exthos.Engine({ metrics: { json_api: {} } }, { isLocal: process.env["isLocal"] ? process.env["isLocal"] === "true" : true })
engine.useDefaultEventHandler()


let stream1 = new exthos.Stream({
    input: { inport: {} },
    pipeline: {
        processors: [
            { bloblang: `root = "hello > " + content()` }
        ]
    },
    output: { stdout: {} }
}, true);

engine.add(stream1)
await engine.start()

stream1.inport.send("my msg1 to the world");
stream1.inport.send("my msg2 to the world");

setTimeout(() => {
    engine.remove(stream1)
}, 2000);