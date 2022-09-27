import * as exthos from "../../dist/index.js";

let engine = new exthos.Engine({});
engine.useDefaultEventHandler({
  "engine.fatal": (eventObj) => {
    console.log("\nTest EXITED with CODE=1", JSON.stringify(eventObj));
    process.exit(1);
  },
});

let stream1 = new exthos.Stream({
  input: { stdin: {} },
  output: { stdout: {} },
});
engine.add(stream1);
engine.start();

// stop the engine and all its streams after 5 seconds
setTimeout(() => {
  engine.stop();
}, 5000);
