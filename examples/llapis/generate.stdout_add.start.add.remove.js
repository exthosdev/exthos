import * as exthos from "../../dist/index.js";

let engine = new exthos.Engine(
  {},
  { isLocal: process.env["isLocal"] ? process.env["isLocal"] === "true" : true }
);
engine.useDefaultEventHandler({
  "engine.fatal": (eventObj) => {
    console.log("\nTest EXITED with CODE=1", JSON.stringify(eventObj));
    process.exit(1);
  },
});

let stream1 = new exthos.Stream({
  input: { generate: { mapping: `root = "stream1"` } },
  output: { stdout: {} },
});
engine.add(stream1);
await engine.start();

let stream2 = new exthos.Stream({
  input: { generate: { mapping: `root = "stream2"` } },
  output: { stdout: {} },
});

setTimeout(() => {
  engine.add(stream2);
}, 2000);

setTimeout(() => {
  engine.remove(stream1, stream2);
}, 5000);
