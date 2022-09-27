import { defaultInputValues } from "../defaults/defaultInputValues.js";
import { defaultOutputValues } from "../defaults/defaultOutputValues.js";
import * as path from "path";
import { tmpdir } from "os";
import * as fs from "fs";
import { randomUUID } from "crypto";
import * as utils from "../utils/utils.js";
import { defaultProcessorValues } from "../defaults/defaultProcessorValues.js";
import debug from "debug";
import { TStreamConfig } from "../types/streamConfig.js";
import * as nanomsg from "nanomsg";
import merge from "lodash.merge";
import { TInput } from "../types/inputs.js";
import { TOutput } from "../types/outputs.js";
import { TProcessor } from "../types/processors.js";

class Stream {
  #streamConfig: TStreamConfig;
  hasInport: boolean = false;
  hasOutport: boolean = false;

  #debugLog = debug("exthos").extend("stream:debugLog");
  // #status: "stopped" | "started" = "stopped"
  #inport!: nanomsg.Socket; // internal.Writable
  #outport!: nanomsg.Socket; // internal.Readable
  #JSFilesToWrite: { [jsFile: string]: string } = {};

  public readonly streamID: string = randomUUID();
  // public active uptime uptime_str TODO. these should be part of the stream

  get streamConfig(): TStreamConfig {
    return this.#streamConfig;
  }
  set streamConfig(s: TStreamConfig) {
    this.#streamConfig = Stream.#sanitizeStreamConfig.call(this, s);
  }

  get inport() {
    return this.#inport;
  }

  get outport() {
    return this.#outport;
  }

  createInport() {
    let self = this;
    if (!this.#inport) {
      // create inport on stream in js-land if not already created
      this.#inport = nanomsg.socket("push");
      this.#inport.bind(`ipc:///tmp/${self.streamID}.inport.sock`);
    }
  }

  createOutport(this: Stream) {
    let self = this;
    if (!self.#outport) {
      // create outport on stream in js-land if not already created
      this.#outport = nanomsg.socket("pull");
      this.#outport.bind(`ipc:///tmp/${self.streamID}.outport.sock`);
    }
  }

  constructor(streamConfig: TStreamConfig) {
    this.#debugLog(
      "received streamConfig:\n",
      JSON.stringify(streamConfig, null, 0)
    );

    this.#streamConfig = Stream.#sanitizeStreamConfig.call(this, streamConfig);

    this.#debugLog(
      "sanitized streamConfig:\n",
      JSON.stringify(this.#streamConfig, null, 0)
    );
  }

  /**
   * beforeAdd must be called before adding the stream to the engineProcess
   * is invoked only once even if client invokde it multiple times
   */
  beforeAdd = function (this: Stream) {
    let self = this;
    var executed = false;
    return async function () {
      if (!executed) {
        executed = true;
        let proms: Promise<any>[] = [];
        // write any JS files if needed
        Object.keys(self.#JSFilesToWrite).forEach((jsFile) => {
          let unWrapedCode = Stream.#wrapJSCode(self.#JSFilesToWrite[jsFile]);
          self.#debugLog("writing javascript to file:", jsFile);
          proms.push(fs.promises.writeFile(jsFile, unWrapedCode));
        });

        return await Promise.all(proms);
      }
      return await Promise.all([]);
    };
  }.apply(this);

  afterRemove = function (this: Stream) {
    let self = this;
    var executed = false;
    return async function () {
      if (!executed) {
        executed = true;
        let proms: Promise<any>[] = [];
        // write any JS files if needed
        Object.keys(self.#JSFilesToWrite).forEach((jsFile) => {
          self.#debugLog("removing javascript to file:", jsFile);
          proms.push(fs.promises.unlink(jsFile));
        });

        return await Promise.all(proms);
      }
      return await Promise.all([]);
    };
  }.apply(this);

  /**
   * takes in a streamConfig, create a copy to mutate and performs the replaceValue and replaceKey operations
   * @param receivedStreamConfig
   * @returns
   */
  static #sanitizeStreamConfig(
    this: Stream,
    receivedStreamConfig: TStreamConfig
  ): TStreamConfig {
    let self = this;

    let streamConfig = merge({}, receivedStreamConfig);
    // if javascript exists, replace it with value for branch
    // if outport exists, assign a unix socket for ipc to the value for outport
    utils.replaceValueForKey(streamConfig, {
      javascript: (existingValue: string) => {
        let jsFile = path.join(
          tmpdir(),
          "exthos_jsFile_" + randomUUID() + ".js"
        );
        self.#JSFilesToWrite[jsFile] = existingValue;
        return {
          request_map: `root = {}
                              root.content = this.catch(content())
                              root.meta = meta()
                          `, // root.content = content().string().catch(content())
          processors: [
            {
              subprocess: {
                name: "node",
                args: [jsFile],
              },
            },
          ],
          result_map: `
                          root = if (this.exists("content") && this.exists("meta")).catch(false) {
                              this.content
                          } else {
                              deleted()
                          }
                          meta = if (this.exists("content") && this.exists("meta")).catch(false) {
                              this.meta
                          } else {
                              meta()
                          }`,
        };
      },
      inport: (_: any) => {
        return {
          urls: [`ipc:///tmp/${self.streamID}.inport.sock`],
          bind: false,
        };
      },
      outport: (_: any) => {
        return {
          urls: [`ipc:///tmp/${self.streamID}.outport.sock`],
        };
      },
    });

    // covert inport to nanomsg and allow write and end
    // convert outport into anomsg and allow read
    // covert direct to inproc
    utils.replaceKeys(streamConfig, {
      javascript: () => {
        return "branch";
      },
      inport: () => {
        self.hasInport = true;
        return "nanomsg";
      },
      outport: () => {
        self.hasOutport = true;
        return "nanomsg";
      },
      direct: () => {
        return "inproc";
      },
    });

    // labels must match ^[a-z0-9_]+$ and NOT start with underscore, convert non compliant label by replacing with '_'
    // AND apply defaults to input, output, processors, inputs, outputs
    utils.replaceValueForKey(streamConfig, {
      label: (existingValue: string) => {
        let newValue = existingValue.toLowerCase(); // only lowercase is allowed
        newValue = newValue.replace(/[^a-z0-9_]/g, "_"); // replace all non compliant chars with _
        newValue = newValue.replace(/^_*/g, ""); // replace leading underscores if any
        return newValue;
      },
      input: (existingValue: TInput) => {
        let componentType = Object.keys(existingValue).filter(
          (x) => x !== "label"
        )[0]; // eg. generate
        return merge(
          {},
          {
            label: "",
            [componentType]: (defaultInputValues as any)[componentType],
          },
          existingValue
        );
      },
      output: (existingValue: TOutput) => {
        let componentType = Object.keys(existingValue).filter(
          (x) => x !== "label"
        )[0]; // eg. generate
        return merge(
          {},
          {
            label: "",
            [componentType]: (defaultOutputValues as any)[componentType],
          },
          existingValue
        );
      },
      processors: (existingValues: TProcessor[]) => {
        let toReturn: TProcessor[] = [];
        existingValues.forEach((existingValue) => {
          let componentType = Object.keys(existingValue).filter(
            (x) => x !== "label"
          )[0]; // eg. generate
          toReturn.push(
            merge(
              {},
              {
                label: "",
                [componentType]: (defaultProcessorValues as any)[componentType],
              },
              existingValue
            )
          );
        });
        return toReturn;
      },
      inputs: (existingValues: TInput[]) => {
        let toReturn: TInput[] = [];
        existingValues.forEach((existingValue) => {
          let componentType = Object.keys(existingValue).filter(
            (x) => x !== "label"
          )[0]; // eg. generate
          toReturn.push(
            merge(
              {},
              {
                label: "",
                [componentType]: (defaultInputValues as any)[componentType],
              },
              existingValue
            )
          );
        });
        return toReturn;
      },
      outputs: (existingValues: TOutput[]) => {
        let toReturn: TOutput[] = [];
        existingValues.forEach((existingValue) => {
          let componentType = Object.keys(existingValue).filter(
            (x) => x !== "label"
          )[0]; // eg. generate
          toReturn.push(
            merge(
              {},
              {
                label: "",
                [componentType]: (defaultOutputValues as any)[componentType],
              },
              existingValue
            )
          );
        });
        return toReturn;
      },
    });
    return streamConfig;
  }

  static #wrapJSCode(jscode: string): string {
    return `//js code autocreated by exthos
      try {
          process.stdin.setEncoding('utf8');
          process.stdout.setEncoding('utf8');
          
          var lineReader = require('readline').createInterface({
              input: process.stdin
          });
          lineReader.on('line', function (msg) {
              try{
                  msg = JSON.parse(msg.toString())
                  ;(()=>{
                      let console = null
                      let process = null
                      ${jscode}
                  })();
                  console.log(JSON.stringify(msg))
              } catch(e) {
                  console.error(e)
              }
          });
      } catch (e) {
          console.error(e.message)
      }`;
  }
}

export { Stream };

// quick testing
// new Stream({
//     input: {
//         broker: {
//             inputs: [
//                 { generate: { mapping: `root = "hi"`, count: 2 } }
//             ]
//         },
//         processors: [
//             {
//                 label: "LABEL_input.processors.log",
//                 log: { message: 'input.processors.log here :)' } }
//         ]
//     },
//     pipeline: {
//         processors: [
//             { branch: {
//                 processors: [
//                     { log: { message: 'pipeline.processors.branch.processors.log here :)' } }
//                 ]
//             }}

//         ]
//     },
//     // output: { stdout: {} }
//     output: {file: {path: "", codec: "all-bytes"}}
// })
