import * as exthos from "../../dist/index.js";

let engine = new exthos.Engine({}, {debugNamespace: "exthos:engine:debugLog*"});
engine.useDefaultEventHandler({
  "engine.fatal": (eventObj) => {
    console.log("\nTest EXITED with CODE=1", JSON.stringify(eventObj));
    process.exit(1);
  },
});

console.log("!!!1")
await engine.start();
console.log("!!!2")
await engine.start();
console.log("!!!3")
await engine.stop()
console.log("!!!4")
await engine.start();
