import { from, engine } from "../../dist/index.js";

engine.useDefaultEventHandler({
  "engine.fatal": (eventObj) => {
    console.log("\nTest EXITED with CODE=1", JSON.stringify(eventObj));
    process.exit(1);
  },
});
engine.updateEngineConfigs({ logger: { level: "ALL", format: "json" } });

/**
 * Either one of the following
 * Although, method #1 is preferred and probably easier to manage
 */

/**
 * method #1: using await
 */
// NOTE: If you are not using js modules, then top level await will not work.
//       In which case, wrap is inside an async block. e.g.:
//                  ;(async() => {.....})();
try {
  let route = await from({
    generate: { mapping: 'root = count("gen")', count: 2 },
  })
    .blablabla()
    .to({ stdout: {} });
  await route.start().stop();
} catch (e) {
  console.log("caught an error:", e.message);
}

/**
 * method #2: using .catch
 */
// let route = from({ generate: { mapping: 'root = count("gen")', count: 2 } }).blablabla().to({ stdout: {} })
// route.start().stop().catch(e => { console.log("caught an error:", e.message) })
