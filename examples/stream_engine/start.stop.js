import exthos from "../../dist/index.js";
import defaultEngineEventHandler from "./defaultEngineEventHandler.js"

let engine = new exthos.Engine({})
engine.onAny(defaultEngineEventHandler.bind(engine))

engine.start()

setTimeout(() => {
    engine.stop()
}, 3000);