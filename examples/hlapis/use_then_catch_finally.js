import { from, engine } from "../../dist/index.js";

engine.useDefaultEventHandler({
  "engine.fatal": (eventObj) => {
    console.log("\nTest EXITED with CODE=1", JSON.stringify(eventObj));
    process.exit(1);
  },
});

from({ stdin: {} })
  .batchInput({ count: 1 })
  .to({ stdout: {} })
  .then((route) => {
    console.log("0: route has been created");
    route
      .start()
      .then((route) => {
        console.log("1: route has started");
        route
          .stopAfter(2000)
          .then((route) => {
            console.log("2: route has stopped");
          })
          .catch((e) => {
            console.log("2: route stopping has failed:", e.message);
          })
          .finally(() => {
            console.log("99: finally finished");
          });
      })
      .catch((e) => {
        console.log("1: route starting has failed:", e.message);
      });
  })
  .catch((e) => {
    console.log("0: route creation has failed:", e.message);
  });
