import exthos from "../../../dist/index.js";
import defaultEngineEventHandler from "../defaultEngineEventHandler.js"

let engine = new exthos.Engine({})
engine.onAny(defaultEngineEventHandler.bind(engine))

let streams = []
process.env.REDIS_STREAMS.split(",").forEach(streamName => {
    streams.push(new exthos.Stream({
        input: {
            redis_streams: {
                url: process.env.REDIS_PROD,
                kind: "simple",
                tls: {
                    enabled: true,
                    enable_renegotiation: true
                },
                body_key: "event", // keys of interest: jobId, event, returnvalue, data, Timestamp
                streams: [streamName],
                start_from_oldest: true,
                consumer_group: "exthos",
                client_id: "001",
                create_streams: false,
                commit_period: "2s"
            },
        },
        pipeline: {
            processors: [
                {
                    bloblang: `root = {}
                    root.jobId = meta("jobId")
                    root.event = content().string()
                    root.commitId = meta("redis_stream")
                    root.data = meta("data")
                    root.returnvalue = meta("returnvalue")
                    root.streamName = "${streamName}"
                ` },
                // {
                //     log: {
                //         fields_mapping: "root = meta()"
                //     }
                // },
            ]
        },
        output: {
            // http_client: {
            //     verb: "POST",
            //     url: '${! env("STREAMING_DATASET_URL")}',
            //     batching: {
            //         byte_size: 0.5 * 1024 * 1024, // 0.5MB
            //         period: "1s",
            //         processors: [
            //             {
            //                 archive: {
            //                     format: "json_array"
            //                 }
            //             }
            //         ]
            //     }
            // }
            stdout: {}
        }
    
    }))
})

engine.add(...streams)
engine.start()
