import { from, engine } from "../../dist/index.js"

engine.useDefaultEventHandler()
engine.updateEngineConfigOptions({ logger: { level: "ALL", format: "json" } })

try {
    let route = from({ generate: { mapping: 'root = count("gen")', count: 1 } })
        ._via({ log: { message: "log#1" } })
        ._via({ log: { message: "log#2" } })
        .to({ stdout: {} })
    await route.start().stop()
} catch (e) {
    console.log("caught an error:", e.message)
} finally {
    console.log("done")
}
