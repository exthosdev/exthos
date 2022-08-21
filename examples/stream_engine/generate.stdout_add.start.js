import exthos from "../../dist/index.js";
import defaultEngineEventHandler from "./defaultEngineEventHandler.js"

let engine = new exthos.Engine({ metrics: { json_api: {} } }, { isLocal: process.env["isLocal"] ? process.env["isLocal"] === "true" : true })
engine.onAny(defaultEngineEventHandler.bind(engine))

let stream1 = new exthos.Stream({ input: { generate: { mapping: `root = "stream1"` } }, output: { stdout: {} } })
engine.add(stream1)
await engine.start()
