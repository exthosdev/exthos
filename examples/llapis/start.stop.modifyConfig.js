import * as exthos from "../../dist/index.js";

let engine = new exthos.Engine({})
engine.useDefaultEventHandler()

await engine.updateEngineConfigOptions({ logger: { "level": "WARN" } })

await engine.start()

setTimeout(() => {
    engine.stop()
}, 3000);