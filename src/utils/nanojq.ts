/**
 * A minimalist implementation of jq to get and set values using a path
 * assumes that path is separate using underscore
 */

import merge from "lodash.merge";

let nanojq = {
  get: (obj: any, path: string) => {
    let dotKey = path;
    let dotKeySteps = dotKey.length > 0 ? dotKey.split("_") : [];
    return dotKeySteps.reduce((pv, cv) => {
      return pv[cv];
    }, obj);
  },
  /**
   * does NOT mutate the object
   * @param obj
   * @param path
   * @param val
   * @returns
   */
  set: (obj: any, path: string, val: any) => {
    let toReturn = {};
    let dotKey = path;
    let dotKeySteps = dotKey.length > 0 ? dotKey.split("_") : [];

    let tempConf: any = {}; // at a dotKey level; will be merged into obj
    let temp = tempConf; // at
    dotKeySteps.forEach((dotKeyStep, idx) => {
      temp = temp || {};
      if (dotKeySteps.length - 1 === idx) {
        temp[dotKeyStep] = val;
        toReturn = merge({}, obj, tempConf);
      } else {
        temp[dotKeyStep] = {};
        temp = temp[dotKeyStep];
      }
    });
    return toReturn;
  },
};

export { nanojq };
