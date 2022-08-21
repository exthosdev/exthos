import { TProcessor } from "../types/processors"

const defaultProcessorValues: TProcessor = {
    label: "",

    noop: {},

    bloblang: "",

    archive: {
        format: "binary",
        path: ""
    },

    log: {
        level: "INFO",
        fields_mapping: "root = {}",
        message: ""
    },

    subprocess: {
        name: "",
        args: [],
        max_buffer: 65536,
        codec_send: "lines",
        codec_recv: "lines",
    },

    javascript: "",

    branch: {
        request_map: "",
        processors: [],
        result_map: ""
    }
}

export { defaultProcessorValues }