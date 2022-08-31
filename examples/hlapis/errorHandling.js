import { from, engine } from "../../dist/index.js"

engine.useDefaultEventHandler()
engine.setEngineOptions({ logger: { level: "ALL", format: "json" } })

/**
 * Either one of the following
 * Although, method #1 is preferred and probably easier to manage
 */

// method #1: using await
try {
    let route = await from({ generate: { mapping: 'root = count("gen")', count: 2 } }).blablabla().to({ stdout: {} })
    await route.start().stop()
} catch (e) {
    console.log("caught an error:", e.message)
}

// method #2: using .catch
// let route = from({ generate: { mapping: 'root = count("gen")', count: 2 } }).blablabla().to({ stdout: {} })
// route.start().stop().catch(e => { console.log("caught an error:", e.message) })


