import { Engine } from "../engine/engine.js";
import { TInput } from "../types/inputs.js";
import { from as _from } from "./route.js";

let from = (...inputs: [TInput, ...TInput[]]) => {
    return _from(engine, ...inputs)
}
let engine = new Engine()
export { from, engine }