import { from, engine } from "../../dist/index.js"

engine.useDefaultEventHandler()

let route = from({ generate: { mapping: 'root = count("gen")' } }).to({ direct: "r1" })
let route1 = from({ direct: "r1" }).to({ stdout: {} }).start()
let route2 = from({ direct: "r1" }).to({ stdout: {} }).start()

route.start()

setTimeout(() => {
    route.stop()
}, 1000);

setTimeout(() => {
    route1.stop()
    // route2.stop()
}, 2000);
