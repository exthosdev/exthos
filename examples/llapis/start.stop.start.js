import * as exthos from "../../dist/index.js";

let engine = new exthos.Engine({}, {debugNamespace: "exthos:engine:debugLog*"});
engine.useDefaultEventHandler({
  "engine.fatal": (eventObj) => {
    console.log("\nTest EXITED with CODE=1", JSON.stringify(eventObj));
    process.exit(1);
  },
});

await engine.start();
await engine.start();
await engine.stop()
await engine.start();
