import { from, engine } from "../../dist/index.js"

engine.useDefaultEventHandler()
engine.setEngineConfigOptions({ logger: { level: "ALL", format: "json" } })

let route = from({ generate: { mapping: 'root = count("gen")', count: 2 } }).batchInput({ count: 2 }).batchOutput({ count: 2 }).to({ stdout: {} })

route.start().stop() //.catch(e => {console.log("caught error:", e)})
