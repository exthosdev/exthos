import * as exthos from "../../dist/index.js";

let engine = new exthos.Engine({});
engine.useDefaultEventHandler({
  "engine.fatal": (eventObj) => {
    console.log("\nTest EXITED with CODE=1", JSON.stringify(eventObj));
    process.exit(1);
  },
});

await engine.updateEngineConfigs({ logger: { level: "WARN" } });

await engine.start();

setTimeout(() => {
  engine.stop();
}, 3000);
