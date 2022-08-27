import { from, engine } from "../../dist/index.js"

engine.useDefaultEventHandler()
engine.setEngineOptions({logger:{level: "ALL", format: "json"}})

let route = from({ generate: { mapping: 'root = count("gen")', count: 6 } }).batchAtInput({ count: 2 }).batchAtOutput({ count: 6 }).to({ stdout: {} })

route.start()

setTimeout(() => {
    route.stop()
}, 8000);

