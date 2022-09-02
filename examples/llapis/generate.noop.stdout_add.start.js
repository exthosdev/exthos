import * as exthos from "../../dist/index.js";

let engine = new exthos.Engine({ metrics: { json_api: {} } }, { isLocal: process.env["isLocal"] ? process.env["isLocal"] === "true" : true })
engine.useDefaultEventHandler()

let stream1 = new exthos.Stream({
    input: { generate: { mapping: `root = "you nailed it"`, count: 2 } },
    pipeline: {
        processors: [{ noop: {} }]
    },
    output: { stdout: {} }
});

engine.add(stream1)
engine.start()