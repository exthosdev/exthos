import { Engine } from "../engine/engine.js";
import { TInput } from "../types/inputs.js";
import { from as _from } from "./route.js";

let engine: Engine = new Engine();
let from = (...inputs: [TInput, ...TInput[]]) => {
  return _from(engine, ...inputs);
};

export { from, engine };

// quick testing
// let route = from({ generate: { mapping: 'root = count("gen")', count: 1 } })
//     ._via({ bloblang: `throw("err0r")` })
//     .to({ stdout: {} })
// route.start().stop()
