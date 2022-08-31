import { from, engine } from "../../dist/index.js"

engine.useDefaultEventHandler()
engine.setEngineConfigOptions({logger:{level: "ALL", format: "json"}})

let route = from({ generate: { mapping: 'root = count("gen")', count: 6 } }).to({ stdout: {} })
route.start().stopAfter(2000).catch(e=> {console.log("e=", e)})
