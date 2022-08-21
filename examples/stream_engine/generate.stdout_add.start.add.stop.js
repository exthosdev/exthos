import exthos from "../../dist/index.js";
import defaultEngineEventHandler from "./defaultEngineEventHandler.js"

let engine = new exthos.Engine({})
engine.onAny(defaultEngineEventHandler.bind(engine))

let stream1 = new exthos.Stream({ input: { generate: {mapping: `root = "stream1"`} }, output: { stdout: {} } })
engine.add(stream1)
engine.start()

let stream2 = new exthos.Stream({ input: { generate: {mapping: `root = "stream2"`} }, output: { stdout: {} } })

setTimeout(() => {
    engine.add(stream2)    
}, 2000);

// stop the engine and all its streams after 5 seconds
setTimeout(() => {
    engine.stop()
}, 5000);