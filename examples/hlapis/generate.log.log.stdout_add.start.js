import { from, engine } from "../../dist/index.js";

engine.useDefaultEventHandler({
  "engine.fatal": (eventObj) => {
    console.log("\nTest EXITED with CODE=1", JSON.stringify(eventObj));
    process.exit(1);
  },
});
engine.updateEngineConfigs({ logger: { level: "ALL", format: "json" } });

try {
  let route = from({ generate: { mapping: 'root = count("gen")', count: 1 } })
    ._via({ log: { message: "log#1" } })
    ._via({ log: { message: "log#2" } })
    .to({ stdout: {} });
  await route.start().stop();
} catch (e) {
  console.log("caught an error:", e.message);
} finally {
  console.log("done");
}
