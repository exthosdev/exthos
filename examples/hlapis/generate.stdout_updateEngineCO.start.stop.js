import { from, engine } from "../../dist/index.js"

engine.useDefaultEventHandler()
engine.updateEngineConfigOptions({ logger: { "level": "TRACE" } })

try {
    let route = await from({ generate: { mapping: 'root = count("gen")', count: 2 } }).to({ stdout: {} })
    await route.start().stopAfter(2000)
    await engine.stop()
} catch (e) {
    console.log("error thrown:", e.message)
}

