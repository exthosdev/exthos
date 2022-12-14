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
    generate: { mapping: `root = "msg#" + count("gen").string()`, count: 2 },
  },
  output: { outport: {} },
});
engine.add(stream1);
await engine.start();

stream1.outport.on("data", (d) => {
  console.log(`rec data: ${d.toString()}`);
});
