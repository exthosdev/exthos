import { from, engine } from "../../../dist/index.js";

try {
  engine.useDefaultEventHandler({
    "engine.fatal": (eventObj) => {
      console.log("\nTest EXITED with CODE=1", JSON.stringify(eventObj));
      process.exit(1);
    },
  });
  await engine.updateEngineConfigs(
    { logger: { level: "TRACE" } },
    { isLocal: false }
  );

  let route = await from({
    generate: { mapping: 'root = count("gen")', count: 2 },
  }).to({ stdout: {} });
  await route.start().stopAfter(2000);
  await engine.stop();
} catch (e) {
  console.log("error thrown:", e.message);
}
