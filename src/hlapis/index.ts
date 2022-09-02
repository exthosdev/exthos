import { Engine } from "../engine/engine.js";
import { TInput } from "../types/inputs.js";
import { from as _from } from "./route.js";

let from = (...inputs: [TInput, ...TInput[]]) => {
    return _from(engine, ...inputs)
}

let engine: Engine = new Engine()

export { from, engine }

// quick testing
// let route = from({ generate: { mapping: 'root = count("gen")', count: 1 } })
//     ._via({ log: { message: "log#1" } })
//     ._via({ log: { message: "log#2" } })
//     .to({ stdout: {} })
// route.start().stop()