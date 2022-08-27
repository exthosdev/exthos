import * as exthos from "../../dist/index.js";

let engine = new exthos.Engine({ metrics: { json_api: {} } }, { isLocal: process.env["isLocal"] ? process.env["isLocal"] === "true" : true })
engine.useDefaultEventHandler()

let stream1 = new exthos.Stream({
    input: {
        generate: {
            mapping: `root = count("gen")`,
            count: 2
        }
    },
    pipeline: {
        processors: [
            {
                bloblang: `meta = {"a": 1}`
            },
            {
                log: {
                    message: '${! ">>all_preall>>" + content() + meta().string()}'
                }
            },
            {
                javascript: `
                msg.content = msg.content + 100
                msg.meta = {...msg.meta, ...{"b":2}}
                 `
            },
            {
                javascript: `
                msg.content = msg.content + 100
                msg.meta = {...msg.meta, ...{"c":3}}
                 `
            },
            {
                log: {
                    message: '${! ">>all_postall>>" + content() + meta().string()}'
                }
            }
        ]
    },
    output: { stdout: {} }
})
engine.add(stream1)
await engine.start()
