import { from, engine } from "../../dist/index.js"

engine.useDefaultEventHandler()
// engine.setEngineConfigOptions({logger:{level: "ALL", format: "json"}})

let route = from({ generate: { mapping: 'root = count("gen")', count: 6 } }).to({ stdout: {} })
route.startAfter(1000).stopAfter(1000).startAfter(1000).stopAfter(1000)
