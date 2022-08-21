import { TInput } from "./inputs"
import { TOutput } from "./outputs"
import { TProcessor } from "./processors"

// type TStreamConfig = {
//     input: TInput,
//     output: TOutput,
//     pipeline?: {
//         threads?: number
//         processors: TProcessor[]
//     }
// }

interface TStreamConfig {
    input: TInput,
    output: TOutput,
    pipeline?: {
        threads?: number
        processors: TProcessor[]
    }
}

export {TStreamConfig}