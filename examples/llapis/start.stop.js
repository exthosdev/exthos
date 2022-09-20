import * as exthos from "../../dist/index.js";

let engine = new exthos.Engine({});
engine.useDefaultEventHandler({
  "engine.fatal": (eventObj) => {
    console.log("\nTest EXITED with CODE=1", JSON.stringify(eventObj));
    process.exit(1);
  },
});

engine.start();

setTimeout(() => {
  engine.stop();
}, 3000);
