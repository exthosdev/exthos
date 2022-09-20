import { readFileSync } from "fs";
import merge from "lodash.merge";
import debug from "../utils/debug.js";
import { nanojq } from "../utils/nanojq.js";
import { formatErrorForEvent } from "../utils/utils.js";

import config from "./config.default.js";

Object.defineProperty(config, "debugLog", {
  enumerable: false,
  writable: false,
  value: debug.extend("config"),
});

/**
 * `config.refresh` can be used to refresh the config as and when required
 * config merging process
 * defaults --overwrittenby--> config.js -> process.env["EXTHOS_xxx"]
 */
(config as any)["refresh"] = function () {
  let config = this;
  try {
    let configFile = readFileSync("./config.js");
    merge(config, JSON.parse(configFile.toString()));
    config.debugLog("successfully merged ./config.js");
  } catch (e: any) {
    if (e.code === "ENOENT") {
      config.debugLog("./config.js not present");
    } else {
      // file exists
      config.debugLog("failed to merge ./config.js", {
        error: formatErrorForEvent(e),
      });
    }
  }

  try {
    let toMerge = {};
    Object.keys(process.env)
      .filter((k) => k.startsWith("EXTHOS_"))
      .forEach((k) => {
        let toMergeKey = k.replace(/^EXTHOS_/, "");
        // (toMerge as any)[toMergeKey] = process.env[k];
        toMerge = nanojq.set(toMerge, toMergeKey, process.env[k]);
      });
    console.log("!!!1", config, toMerge);
    merge(config, toMerge);
    console.log("!!!2", config);
    config.debugLog("successfully merged env variables EXTHOS_*");
  } catch (e: any) {
    config.debugLog("failed to merge env variables EXTHOS_*", {
      error: formatErrorForEvent(e),
    });
  }
};

(config as any).refresh();

let engineExtraConfig = config.engineExtraConfig;
let engineConfig = config.engineConfig;

export { engineExtraConfig, engineConfig };
export default config;
