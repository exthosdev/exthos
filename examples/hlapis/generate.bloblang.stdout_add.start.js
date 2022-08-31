import { from, engine } from "../../dist/index.js"

engine.useDefaultEventHandler()
engine.setEngineConfigOptions({ logger: { level: "ALL", format: "json" } })

try {
    let route = from({ generate: { mapping: 'root = count("gen")', count: 1 } })
        ._via({ bloblang: `root = content().string() + " good deed(s) a day"` })
        .to({ stdout: {} })
    await route.start().stop()
} catch (e) {
    console.log("caught an error:", e.message)
}
