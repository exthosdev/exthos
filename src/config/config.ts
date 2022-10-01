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
 * defaults --overwrittenby--> exthos.config.json -> process.env["EXTHOS_xxx"]
 */
(config as any)["refresh"] = function () {
  let config = this;
  try {
    let configFile = readFileSync("./exthos.config.json");

    merge(config, JSON.parse(configFile.toString()));
    config.debugLog("successfully merged ./exthos.config.json");
  } catch (e: any) {
    if (e.code === "ENOENT") {
      config.debugLog("./exthos.config.json not present");
    } else {
      // file exists
      config.debugLog("failed to merge ./exthos.config.json", {
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
        let toMergeValue: any = process.env[k];
        // convert toMergeValue string to boolean or number if possible
        if (["true", "false"].includes(process.env[k] as string)) {
          toMergeValue = toMergeValue === "true";
        } else if (parseFloat(toMergeValue) !== NaN) {
          toMergeValue = parseFloat(toMergeValue);
        }
        toMerge = nanojq.set(toMerge, toMergeKey, toMergeValue);
      });
    merge(config, toMerge);
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
