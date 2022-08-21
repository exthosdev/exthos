import { from, engine, defaultEngineEventHandler } from "../../dist/index.js"
engine.onAny(defaultEngineEventHandler)

let route = from({ generate: { mapping: 'root = count("gen")' } }).to({ direct: "r1" })
let route1 = from({ direct: "r1" }).to({ stdout: {} }).start()
let route2 = from({ direct: "r1" }).to({ stdout: {} }).start()

route.start()

setTimeout(() => {
    route.stop()
}, 4000);

setTimeout(() => {
    route1.stop()
    // route2.stop()
}, 8000);
