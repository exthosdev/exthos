import * as exthos from "../../dist/index.js";

let engine = new exthos.Engine(
  { metrics: { json_api: {} } },
  { isLocal: process.env["isLocal"] ? process.env["isLocal"] === "true" : true }
);
engine.useDefaultEventHandler({
  "engine.fatal": (eventObj) => {
    console.log("\nTest EXITED with CODE=1", JSON.stringify(eventObj));
    process.exit(1);
  },
});

let stream1 = new exthos.Stream({
  input: {
    broker: {
      inputs: [{ generate: { mapping: `root = "hi"`, count: 2 } }],
    },
    processors: [
      {
        label: "____LABEL_input.processors.log",
        log: { message: "input.processors.log here :)" },
      },
    ],
  },
  pipeline: {
    processors: [
      {
        branch: {
          processors: [
            {
              log: {
                message: "pipeline.processors.branch.processors.log here :)",
              },
            },
          ],
        },
      },
    ],
  },
  output: { stdout: {} },
});

engine.add(stream1);
engine.start();
