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
  input: { generate: { mapping: `root = "hi"`, count: 2 } },
  pipeline: {
    processors: [{ log: { message: "logger here :)" } }],
  },
  output: { stdout: {} },
});
engine.add(stream1);
engine.start();
