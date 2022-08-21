import { TInput } from "../types/inputs"

const defaultInputValues: TInput = {//TInputGenerate | TInputStdin | TInputFile | TInputInPort | TInputRedisStreams | TInputBroker = {
    label: "",
    generate: {
        mapping: "",
        interval: "1s",
        count: 0
    },
    file: {
        paths: [""],
        codec: "lines",
        max_buffer: 1000000,
        delete_on_finish: false
    },
    stdin: {
        codec: "lines",
        max_buffer: 1000000
    },
    redis_streams: {
        url: "",
        kind: "simple",
        master: "",
        tls: {
            enabled: false,
            skip_cert_verify: false,
            enable_renegotiation: false,
            root_cas: "",
            root_cas_file: "",
            client_certs: [],
        },
        body_key: "body",
        streams: [],
        limit: 10,
        client_id: "",
        consumer_group: "",
        create_streams: true,
        start_from_oldest: true,
        commit_period: "1s",
        timeout: "1s",
    },
    broker: {
        copies: 1,
        inputs: [],
        batching: {
            count: 0,
            byte_size: 0,
            period: "",
            check: "",
            processors: []
        }   
    },

    inproc: ""
}

export { defaultInputValues }