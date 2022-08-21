import exthos from "../../dist/index.js";
import defaultEngineEventHandler from "./defaultEngineEventHandler.js"

let engine = new exthos.Engine({})
engine.onAny(defaultEngineEventHandler.bind(engine))

let stream1 = new exthos.Stream({ input: { file: {paths: ["./testdata/data1"]} }, output: { file: {path: './testdata/copy_${! meta("path").filepath_split().1}'} } })

engine.add(stream1)
engine.start()

/**
 * here, the engine will remove the stream once the file transfer is completed, since status will turn inactive
 * OR if the file didnt exist the engine will remove 
 */