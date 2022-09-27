import { TInput } from "./inputs.js";
import { TOutput } from "./outputs.js";
import { TProcessor } from "./processors.js";

// type TStreamConfig = {
//     input: TInput,
//     output: TOutput,
//     pipeline?: {
//         threads?: number
//         processors: TProcessor[]
//     }
// }

interface TStreamConfig {
  input: TInput;
  output: TOutput;
  pipeline?: {
    threads?: number;
    processors: TProcessor[];
  };
}

export { TStreamConfig };
