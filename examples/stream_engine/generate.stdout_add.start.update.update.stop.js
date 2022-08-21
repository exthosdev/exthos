import exthos from "../../dist/index.js";
import defaultEngineEventHandler from "./defaultEngineEventHandler.js"

let engine = new exthos.Engine({})
engine.onAny(defaultEngineEventHandler.bind(engine))

let stream1 = new exthos.Stream({ input: { generate: { mapping: 'root = "world"' } }, output: { stdout: {} } })
engine.add(stream1)
engine.start()


// update stream
setTimeout(() => {
    stream1.streamConfig = {
        ...stream1.streamConfig,
        ...{
            pipeline: {
                processors: [
                    { bloblang: `root = "hello " + content()` }
                ]
            }
        }
    }
    engine.update(stream1)
}, 1000)

// another way to update a stream
setTimeout(() => {
    stream1.streamConfig.pipeline?.processors.push({ bloblang: `root = content() + " again!"` })
    engine.update(stream1)
}, 2000)

// stop the engine and all its streams after 5 seconds
setTimeout(() => {
    engine.stop()
}, 5000);