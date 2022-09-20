import * as exthos from "../../../dist/index.js";

let engine = new exthos.Engine(
  {},
  { debugNamespace: "exthos:engineProcess:info*" }
);
engine.useDefaultEventHandler();

engine.start();
let msg = {
  payload: process.env,
};

let streams = [];
msg.payload.REDIS_STREAMS.split(",").forEach((streamName) => {
  streams.push(
    new exthos.Stream({
      input: {
        broker: {
          inputs: [
            {
              redis_streams: {
                url: msg.payload.REDIS_PROD,
                kind: "simple",
                tls: {
                  enabled: true,
                  enable_renegotiation: true,
                },
                body_key: "event", // keys of interest: jobId, event, returnvalue, data, Timestamp
                streams: [streamName],
                start_from_oldest: true,
                consumer_group: "exthos2",
                client_id: "001",
                create_streams: false,
                commit_period: "2s",
              },
            },
          ],
          batching: {
            period: "1s",
            processors: [
              {
                bloblang: `root = {}
                            root.jobId = meta("jobId")
                            root.event = content().string()
                            root.commitId = meta("redis_stream")
                            root.data = meta("data")
                            root.returnvalue = meta("returnvalue")
                            root.failedReason = meta("failedReason")
                            root.opts = meta("opts")
                            root.attemptsMade = meta("attemptsMade")
                            root.prev = meta("prev")
                            root.streamName = "${streamName}"
                            meta azblobname  = timestamp_unix_nano().string() + ".json"
                        `,
              },
              {
                archive: {
                  format: "json_array",
                },
              },
              // {
              //     log: {
              //         message: '${! count() }'
              //     }
              // }
            ],
          },
        },
      },
      pipeline: {
        processors: [
          // {
          //     bloblang: `root = {}
          //     root.jobId = meta("jobId")
          //     root.event = content().string()
          //     root.commitId = meta("redis_stream")
          //     root.data = meta("data")
          //     root.returnvalue = meta("returnvalue")
          //     root.streamName = "${streamName}"
          // ` },
          {
            log: {
              // fields_mapping: 'root.batch_num = count("batch_num")'
              message:
                'writing stream event [batch_num=${! count("batch_num") }] [azblobname=${! meta("azblobname") }]',
            },
          },
        ],
      },
      output: {
        // azure_blob_storage: {
        //     storage_account: msg.payload["azure_blob_storage.storage_account"],
        //     container: "test2",
        //     storage_connection_string: msg.payload["azure_blob_storage.storage_connection_string"],
        //     // path: '${!timestamp_unix_nano()}.json',
        //     path: '${!meta("azblobname")}'
        // }
        stdout: {},
      },
    })
  );
});

engine.add(...streams);
