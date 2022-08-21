import { from, engine, defaultEngineEventHandler } from "../../dist/index.js"
engine.onAny(defaultEngineEventHandler)
engine.setEngineOptions({logger:{level: "ALL", format: "json"}})

let route = from({ generate: { mapping: 'root = count("gen")' } }).batchAtInput({ count: 2 }).batchAtOutput({ count: 6 }).to({ stdout: {} }) //

route.start()

setTimeout(() => {
    route.stop()
}, 8000);

