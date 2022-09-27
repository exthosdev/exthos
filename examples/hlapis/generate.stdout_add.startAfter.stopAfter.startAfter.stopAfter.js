import { from, engine } from "../../dist/index.js";

engine.useDefaultEventHandler({
  "engine.fatal": (eventObj) => {
    console.log("\nTest EXITED with CODE=1", JSON.stringify(eventObj));
    process.exit(1);
  },
});
// engine.updateEngineConfigs({logger:{level: "ALL", format: "json"}})

let route = from({ generate: { mapping: 'root = count("gen")', count: 6 } }).to(
  { stdout: {} }
);
route.startAfter(1000).stopAfter(1000).startAfter(1000).stopAfter(1000);
