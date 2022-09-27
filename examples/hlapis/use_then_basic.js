import { from, engine } from "../../dist/index.js";

engine.useDefaultEventHandler({
  "engine.fatal": (eventObj) => {
    console.log("\nTest EXITED with CODE=1", JSON.stringify(eventObj));
    process.exit(1);
  },
});

let route = from({ generate: { count: 6 } })
  .batchInput({ count: 1 })
  .to({ stdout: {} });
route.start().then((x) => {
  console.log("route has been started");
});
route.stopAfter(2000).then((x) => {
  console.log("route has been stopped");
});

/**
 * Note: do not do this in production. instead refer to example: use_then_catch_finally.js
 */
