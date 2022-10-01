import * as constants from "../constants.js";
import * as path from "path";
import { tmpdir, EOL } from "os";
import * as fs from "fs";
import { randomUUID } from "crypto";
import {
  Deferred,
  sleep,
  getISOStringLocalTz,
  getCaller,
  formatErrorForEvent,
  standardizeAxiosErrors,
} from "../utils/utils.js";
import { execaCommand, ExecaChildProcess, execaCommandSync } from "execa";
import * as net from "net";
import axios, { AxiosResponse } from "axios";
import axiosRetry from "axios-retry";
import { Stream } from "../stream/stream.js";
import debug from "debug";
import * as stream from "stream";
import { promises as streamPromises } from "stream";
import { EngineProcessAPI } from "./engineProcessAPI.js";
import { once } from "events"; // TODO: remove and eventemitter2.once?
import { Mutex } from "async-mutex";
import { clearInterval } from "timers";
import EventEmitter2, { ListenerFn } from "eventemitter2";
import merge from "lodash.merge";
// import { engineConfig, engineExtraConfig } from "../config/config.js";
import config from "../config/config.js";
import { EngineConfig, EngineExtraConfig } from "../config/types.js";

/**
 * the eventObj type.
 * - an event related to the stream will contain the stream property
 * - an event related to fatal/error/warn will contain the error property
 */
type EventObj = {
  msg: string;
  time: string;
  stream?: Stream;
  error?: any;
  level?: string;
};

type engineEventsTypes =
  | "engine.active"
  | "engine.inactive"
  | "engine.warn"
  | "engine.error"
  | "engine.fatal"
  | "engine.stream.add"
  | "engine.stream.update"
  | "engine.stream.remove"
  | "engine.stream.error"
  | "engineProcess.stream.fatal"
  | "engineProcess.stream.error"
  | "engineProcess.stream.warn"
  | "engineProcess.stream.info"
  | "engineProcess.stream.debug"
  | "engineProcess.stream.trace";

/**
 * Note: all listeners get an additional argument that specifies some details
 */
enum engineEventsEnums {
  /**
   * wildcards work
   */
  "engine.**" = "engine.**", // both are the same
  "engine.*.*" = "engine.*.*",

  "engine.active" = "engine.active",
  "engine.inactive" = "engine.inactive",
  "engine.warn" = "engine.warn",
  "engine.error" = "engine.error", // an error occured with the engine
  "engine.fatal" = "engine.fatal", // engine is stopped when this event is received

  /**
   * engine events related to a stream
   * the eventObj will always contain the stream object
   */
  "engine.stream.add" = "engine.stream.add",
  "engine.stream.update" = "engine.stream.update",
  "engine.stream.remove" = "engine.stream.remove",
  "engine.stream.error" = "engine.stream.error", // an error occured with the engine while working on a stream e.g. add/update etc.

  /**
   * events from stream's logs as they are emitted by the engineProcess
   */

  "engineProcess.stream.fatal" = "engineProcess.stream.fatal", // fatal will .remove() the stream from the engine
  "engineProcess.stream.error" = "engineProcess.stream.error",
  "engineProcess.stream.warn" = "engineProcess.stream.warn",
  "engineProcess.stream.info" = "engineProcess.stream.info",
  "engineProcess.stream.debug" = "engineProcess.stream.debug",
  "engineProcess.stream.trace" = "engineProcess.stream.trace",
}

class Engine extends EngineProcessAPI {
  readonly #engineConfigFilePath: string = path.join(
    tmpdir(),
    "exthos_engine_conf_" + randomUUID() + ".json"
  );
  #engineConfig!: EngineConfig;
  #engineExtraConfig!: EngineExtraConfig;

  #engineProcess!: ExecaChildProcess<string>;
  #abortController = new AbortController();
  #shutdownAfterInactivityFor: number = 10000; // should usually be more than self._waitForActiveEventMs
  // must be more than _mgmtEventsFreqMs
  #mgmtEventsFreqMs: number = 2000;
  public waitForActiveEventMs: number = 5000; // must be more than 2-3 secs to give time for engine to turn active
  #keepAliveInterval!: NodeJS.Timeout;

  /**
   * debug is used heavily;
   * exthos:engine:debugLog - give general debug logs
   * exthos:eventLog - print events as they are emitted
   * exthos:engine:traceLog - prints trace information showing flow of code
   */
  // TODO: get base debug from utils, and make thsese static
  #debug = debug("exthos");
  #debugLog = this.#debug.extend("engine").extend("debugLog");
  #traceLog = this.#debug.extend("engine").extend("traceLog"); // used to print trace lines e.g. line numbers
  #eventLog = this.#debug.extend("eventLog"); // used to print trace lines e.g. line numbers
  #eventNameToEventLog: Partial<Record<engineEventsTypes, debug.Debugger>> = {}; // used to set the debug extend only once per eventName

  #isActive: boolean = false; // engine uses the /ping api to change this state
  #engineConstrStartStopMutex = new Mutex();
  #engineStreamAddUpdateRemoveMutex = new Mutex();
  #engineUpdateConfigOptionsMutex = new Mutex();
  #constructorDone = new Deferred();

  // #isLocal!: boolean;
  // #debugNamespace: string = "";
  #scheme: "http" | "https" = "http";
  #tempLocalServer!: net.Server; // used to verify the IP and Port
  #streamsMap: { [key: string]: Stream } = {};

  #benthosEXEFullPath: string = "/tmp";

  public engineEvents = engineEventsEnums;

  /**
   *
   * @param engineConfig
   * @param engineExtraConfig
   *  isLocal is defaulted to true
   */
  constructor(
    engineConfig: Partial<EngineConfig> = {},
    engineExtraConfig: Partial<EngineExtraConfig> = {}
  ) {
    super();
    let self = this;
    let caller = getCaller();
    self.#traceLog(`engine constructor called from: ${caller}`);

    self.#engineConstrStartStopMutex.runExclusive(() => {
      self.#traceLog(`engine constructor mutex acquired from: ${caller}`);
      try {
        // not using updateEngineConfigs so as to bypass the _constructorDone.promise await in it
        self.#setEngineConfig(engineConfig).then((_) => {
          self.#setEngineExtraConfig(engineExtraConfig).then((_) => {
            self.#createAxiosInstance().then((_) => {
              self.#constructorDone.resolve();
            });
          });
        });
      } catch (e: any) {
        self.emit(self.engineEvents["engine.fatal"], {
          msg: "engine constructor failed",
          error: formatErrorForEvent(e),
          time: getISOStringLocalTz(),
        });
      }

      // engine.active/inactive to mutate the isActive on the engine
      self.on(self.engineEvents["engine.active"], () => {
        self.#isActive = true;
      });
      self.on(self.engineEvents["engine.inactive"], () => {
        self.#isActive = false;
      });
      // currently benthos gives a 503, which we conver to "fatal" - maybe we shoudnt!
      // self.on(self.engineEvents["engineProcess.stream.fatal"], (eventObj: EventObj) => {
      //     if (eventObj.stream) {
      //         self.remove(eventObj.msg, eventObj.stream)
      //     }
      // })
      self.on(self.engineEvents["engine.fatal"], (eventObj: EventObj) => {
        self.stop(eventObj.msg);
      });
    });
  }

  // override emit to allow only engineEventsTypes
  public emit: (
    event: engineEventsTypes,
    eventObj: EventObj,
    ...values: any[]
  ) => boolean = (
    event: engineEventsTypes,
    eventObj: EventObj,
    ...values: any[]
  ) => {
    let self = this;

    try {
      // eventLog the event
      if (!self.#eventNameToEventLog[event]) {
        self.#eventNameToEventLog[event] = self.#eventLog.extend(event);
      }
      self.#eventNameToEventLog[event]!(JSON.stringify(eventObj));

      // also send as an event
      return super.emit(event as string, eventObj, ...values);
    } catch (e: any) {
      self.emit(self.engineEvents["engine.error"], {
        msg: "unable to emit events",
        error: formatErrorForEvent(e),
        time: getISOStringLocalTz(),
      });
      return false;
    }
  };

  public get numStreams(): number {
    try {
      return Object.keys(this.#streamsMap).length;
    } catch (error) {
      return 0;
    }
  }

  // External API, where client must wait for engine to be initialized (aka constructor called)
  public async updateEngineConfigs(
    receivedEngineConfig: Partial<EngineConfig> = {},
    receivedEngineExtraConfig: Partial<EngineExtraConfig> = {}
  ) {
    let self = this;
    let caller = getCaller();
    self.#traceLog(`updateEngineConfigs called from: ${caller}`);

    try {
      await self.#constructorDone.promise;
      return await self.#engineUpdateConfigOptionsMutex.runExclusive(
        async () => {
          self.#traceLog(`updateEngineConfigs mutex acquired from: ${caller}`);
          await self.#setEngineConfig(receivedEngineConfig);
          await self.#setEngineExtraConfig(receivedEngineExtraConfig);
        }
      );
    } catch (e: any) {
      self.emit(self.engineEvents["engine.error"], {
        msg: "unable to update engine config and options",
        error: formatErrorForEvent(e),
        time: getISOStringLocalTz(),
      });
    }
  }

  /**
   * internal API that sets the engine config.
   * called from the constructor and updateEngineConfigs method
   * @param receivedEngineConfig
   */
  async #setEngineConfig(receivedEngineConfig: Partial<EngineConfig>) {
    let self = this;
    self.#traceLog(`#setEngineConfig called from: ${getCaller()}`);

    try {
      if (self.#isActive) {
        throw new Error("cannot set engineConfig on an active engine");
      }

      // take care of engineConfig
      if (this.#engineConfig === undefined) {
        this.#engineConfig = merge(
          {},
          config.engineConfig,
          receivedEngineConfig
        ); // deep merge
      } else {
        this.#engineConfig = merge(
          {},
          config.engineConfig, //.defaultEngineConfig,
          this.#engineConfig,
          receivedEngineConfig
        );
      }

      // speical care so `metrics` contains only a type since merge wont work on it
      if (receivedEngineConfig.metrics) {
        this.#engineConfig.metrics = receivedEngineConfig.metrics;
      }
      // speical care so `tracer` contains only a type since merge wont work on it
      if (receivedEngineConfig.tracer) {
        this.#engineConfig.tracer = receivedEngineConfig.tracer;
      }

      this.#debugLog(
        "received engineConfig:\n",
        JSON.stringify(receivedEngineConfig, null, 0)
      );
      this.#debugLog(
        "sanitized engineConfig created:\n",
        JSON.stringify(this.#engineConfig, null, 0)
      );

      this.#scheme =
        this.#engineConfig.http.cert_file && this.#engineConfig.http.key_file
          ? "https"
          : "http";
    } catch (e: any) {
      self.emit(self.engineEvents["engine.warn"], {
        msg: "unable to update engine config. using defaultEngineConfig",
        error: formatErrorForEvent(e),
        time: getISOStringLocalTz(),
      });
      // if (this.#engineConfig === undefined) {
      //   this.#engineConfig = config.engineConfig; // as EngineConfig; //config.defaultEngineConfig as EngineConfig;
      // }
    }
  }

  /**
   * internal API that sets the engine extraConfig.
   * called from the constructor and updateEngineConfigs method
   * @param receivedEngineExtraConfig
   */
  async #setEngineExtraConfig(
    receivedEngineExtraConfig: Partial<EngineExtraConfig>
  ) {
    let self = this;
    self.#traceLog(`#setEngineExtraConfig called from: ${getCaller()}`);

    try {
      if (self.#isActive) {
        throw new Error("cannot set engineExtraConfig on an active engine");
      }

      // take care of engineExtraConfig
      if (this.#engineExtraConfig === undefined) {
        this.#engineExtraConfig = merge(
          {},
          config.engineExtraConfig,
          receivedEngineExtraConfig
        ); // deep merge
      } else {
        this.#engineExtraConfig = merge(
          {},
          config.engineExtraConfig, //.defaultEngineConfig,
          this.#engineExtraConfig,
          receivedEngineExtraConfig
        );
      }
      // if (receivedEngineExtraConfig === undefined) {
      //   receivedEngineExtraConfig = {};
      // }
      // if (receivedEngineExtraConfig.isLocal === undefined) {
      //   receivedEngineExtraConfig.isLocal = true;
      // }
      // if (
      //   receivedEngineExtraConfig.handleProcessUncaughtException === undefined
      // ) {
      //   receivedEngineExtraConfig.handleProcessUncaughtException = true;
      // }
      // if (
      //   receivedEngineExtraConfig.handleProcessUnhandledRejection === undefined
      // ) {
      //   receivedEngineExtraConfig.handleProcessUnhandledRejection = true;
      // }

      this.#debugLog(
        "received engineExtraConfig:\n",
        JSON.stringify(receivedEngineExtraConfig, null, 0)
      );
      this.#debugLog(
        "sanitized engineExtraConfig created:\n",
        JSON.stringify(this.#engineExtraConfig, null, 0)
      );

      // take care of unhandled exceptions
      if (self.#engineExtraConfig.handleProcessUncaughtException) {
        process.on("uncaughtException", function (e: any) {
          self.emit(self.engineEvents["engine.fatal"], {
            msg: "uncaughtException was received, the engine will attempt to stop gracefully now",
            error: formatErrorForEvent(e),
            time: getISOStringLocalTz(),
          });
        });
      }
      if (self.#engineExtraConfig.handleProcessUnhandledRejection) {
        process.on("unhandledRejection", function (e: any) {
          self.emit(self.engineEvents["engine.fatal"], {
            msg: "unhandledRejection was received, the engine will attempt to stop gracefully now",
            error: formatErrorForEvent(e),
            time: getISOStringLocalTz(),
          });
        });
      }

      // apply debugNamespace
      if (this.#engineExtraConfig.debugNamespace) {
        let prevNamespaces = debug.disable();
        debug.enable(
          [prevNamespaces, this.#engineExtraConfig.debugNamespace].join(",")
        );
      }
    } catch (e: any) {
      self.emit(self.engineEvents["engine.warn"], {
        msg: "unable to update engine options. keeping defaults",
        error: formatErrorForEvent(e),
        time: getISOStringLocalTz(),
      });
    }
  }

  async #createAxiosInstance() {
    let self = this;
    self.#traceLog(
      `createAxiosInstance constructor called from: ${getCaller()}`
    );

    try {
      this._axiosInstance = axios.create({
        baseURL: `${this.#scheme}://${this.#engineConfig.http.address}`,
      });
      axiosRetry(this._axiosInstance, {
        retries: 3,
        retryDelay: axiosRetry.exponentialDelay,
        onRetry: (retryCount, err, requestConfig) => {
          this.#debugLog(
            `retrying (do not panic): ${requestConfig.url}`,
            JSON.stringify({ retryCount: retryCount, error: err.toJSON() })
          );
        },
      });
    } catch (e: any) {
      self.emit(self.engineEvents["engine.fatal"], {
        msg: "unable to create axios instance",
        error: formatErrorForEvent(e),
        time: getISOStringLocalTz(),
      });
    }
  }

  /**
   * start the engine, and the streams already added to it.
   * for remote engines, it will start the mgmt process e.g. ping, cleanup etc.
   * @returns
   */
  public async start(): Promise<Engine> {
    let self = this;
    let caller = getCaller();
    self.#traceLog(`start called from: ${caller}`);

    try {
      return await self.#engineConstrStartStopMutex.runExclusive(async () => {
        self.#traceLog(`start mutex acquired from: ${caller}`);
        if (this.#isActive) {
          // make sure engine is started after a mutex is acquired
          self.#debugLog("engine isActive=true, ignoring the call to start()");
          return self;
        }

        if (self.#engineExtraConfig.isLocal) {
          self.#debugLog("isLocal=true");
          /**
           * CHECK #1 checkExeExists
           */
          let benthosTag = "v" + self.#engineExtraConfig.benthosVersion; // "v4.5.1"
          let benthosVersion = self.#engineExtraConfig.benthosVersion; //"4.5.1"
          let benthosOS = self.#engineExtraConfig.benthosOS; // || "linux";
          let benthosArch = self.#engineExtraConfig.benthosArch; // || "amd64";
          // let benthosArm = ""; // we won't use benthosArm, instead benthosArch has the required values concatinated
          // if benthosFileName is provided following are not used: benthosVersion, benthosOS & benthosArch
          let benthosFileName =
            config.engineExtraConfig.benthosFileName ||
            `benthos_${benthosVersion}_${benthosOS}_${benthosArch}`;
          let benthosDir = config.engineExtraConfig.benthosDir;
          self.#benthosEXEFullPath = path.join(benthosDir, benthosFileName);
          let benthosArchiveFullPath = path.join(
            benthosDir,
            benthosFileName + ".tar.gz"
          );

          if (!config.engineExtraConfig.benthosFileName) {
            // benthosFileName was not provided so will download if not present

            try {
              await fs.promises.stat(self.#benthosEXEFullPath);
              self.#debugLog(
                `${self.#benthosEXEFullPath} exists and will be using it.`
              );
            } catch (e) {
              self.#debugLog(`${self.#benthosEXEFullPath} doesn't exist`);
              try {
                let benthosURL = `https://github.com/benthosdev/benthos/releases/download/${benthosTag}/${
                  benthosFileName + ".tar.gz"
                }`;
                self.#debugLog(`downloading archive from: ${benthosURL}`);
                let resp: AxiosResponse<any, any>;
                try {
                  resp = await axios.get(benthosURL, {
                    responseType: "stream",
                  });
                } catch (e: any) {
                  throw standardizeAxiosErrors(e);
                }
                await streamPromises.pipeline(
                  resp.data,
                  fs.createWriteStream(benthosArchiveFullPath)
                );
                self.#debugLog(`extracting archive ${benthosArchiveFullPath}`);
                execaCommandSync(
                  `tar xzvf ${benthosArchiveFullPath} -C ${benthosDir} benthos`
                );
                execaCommandSync(
                  `mv ${path.join(benthosDir, "benthos")} ${path.join(
                    benthosDir,
                    benthosFileName
                  )}`
                );
                await fs.promises.chmod(self.#benthosEXEFullPath, "0777");
                // fs.chmodSync(self.#benthosEXEFullPath, "0777");
                self.#debugLog(`benthos installation completed`);
              } catch (e: any) {
                self.emit(self.engineEvents["engine.fatal"], {
                  msg: "benthos cannot be installed",
                  error: formatErrorForEvent(e),
                  time: getISOStringLocalTz(),
                }); // TODO: change to error along with the 3
                return self;
              }
            }
          }

          /**
           * CHECK #2 benthos version is supported by exthos
           */
          let versionRequiredMinArray =
            constants.minBenthosVSupported.split(".");
          let versionRequiredMin: {
            major: number;
            minor: number;
            patch: number;
          } = {
            major: parseInt(versionRequiredMinArray[0], 10),
            minor: parseInt(versionRequiredMinArray[1], 10),
            patch: parseInt(versionRequiredMinArray[2], 10),
          };

          // let versionPresent: { major: number; minor: number; patch: number };
          try {
            let versionPresentArray = execaCommandSync(
              `${self.#benthosEXEFullPath} -v`
            )
              .stdout.split(EOL)[0]
              .split(": ")[1]
              .split(".");
            let versionPresent = {
              major: parseInt(versionPresentArray[0], 10),
              minor: parseInt(versionPresentArray[1], 10),
              patch: parseInt(versionPresentArray[2], 10),
            };

            if (
              !(
                versionPresent.major === versionRequiredMin.major &&
                (versionPresent.minor > versionRequiredMin.minor ||
                  (versionPresent.minor === versionRequiredMin.minor &&
                    versionPresent.patch >= versionRequiredMin.patch))
              )
            ) {
              throw new Error(
                `benthos version ${versionPresentArray.join(
                  "."
                )} is not supported by exthos. exthos supports MINOR versions greater than equal to ${versionRequiredMinArray.join(
                  "."
                )}`
              );
            }
            self.#debugLog(
              `using benthos version: ${versionPresentArray.join(".")}`
            );
          } catch (e: any) {
            self.emit(self.engineEvents["engine.fatal"], {
              msg: `benthos cannot be used`,
              error: formatErrorForEvent(e),
              time: getISOStringLocalTz(),
            });
            return self;
          }

          /**
           * CHECK #3 tempLocalServer check
           */
          try {
            // check if address is local and we can bind to it
            self.#debugLog(
              "creating tempLocalServer to establish ADDR, PORT availability"
            );
            self.#tempLocalServer = net.createServer();
            let host = self.#engineConfig.http.address.split(":")[0];
            let port = self.#engineConfig.http.address.split(":")[1];

            // _tempLocalServer listening event
            let isListeningDeferred = new Deferred();
            self.#tempLocalServer.on("listening", () => {
              isListeningDeferred.resolve("deferred_listening");
              self.#debugLog("tempLocalServer is listening");
            });

            // _tempLocalServer error event
            // let _tempLocalServerError
            let isErrorDeferred = new Deferred(); // hack: using this because `once(self._tempLocalServer, "error")` is not working with Promise.race
            self.#tempLocalServer.on("error", (e: any) => {
              if (!e) {
                isErrorDeferred.resolve();
              } else {
                self.#debugLog("tempLocalServer errored out", e);
                isErrorDeferred.reject(e);
              }
            });

            let raceProm = Promise.race([
              isListeningDeferred.promise,
              isErrorDeferred.promise,
              new Promise((_, rj) => {
                setTimeout(() => {
                  rj("tempLocalServer timedout");
                }, 2000);
              }),
            ]);

            // _tempLocalServer.listen
            self.#tempLocalServer.listen(parseInt(port, 10), host, () => {});
            await raceProm;

            // _tempLocalServer.close
            let isCloseErrorDeferred = new Deferred();
            self.#tempLocalServer.close((e: any) => {
              if (!e) {
                self.#tempLocalServer.unref();
                isCloseErrorDeferred.resolve();
              } else {
                self.emit(self.engineEvents["engine.fatal"], {
                  msg: "unable to close tempLocalServer",
                  error: formatErrorForEvent(e),
                  time: getISOStringLocalTz(),
                });
                isCloseErrorDeferred.reject(e);
              }
            });

            await isCloseErrorDeferred.promise;
            self.#debugLog(
              "tempLocalServer closed, i.e. listening=",
              self.#tempLocalServer.listening
            );
          } catch (e: any) {
            self.emit(self.engineEvents["engine.fatal"], {
              msg: "unable to start tempLocalServer",
              error: formatErrorForEvent(e),
              time: getISOStringLocalTz(),
            });
            return self;
          }

          // write the engine config at this point
          Engine.#writeToEngineConfigFilePath.call(self);

          // self._engineProcess = execaCommand(`benthos -c ${self._engineConfigFilePath} streams`, {
          self.#engineProcess = execaCommand(
            `${self.#benthosEXEFullPath} -w -c ${
              self.#engineConfigFilePath
            } streams`,
            {
              signal: self.#abortController.signal,
              buffer: false,
              detached: true, // so that SIGINT on parent doesnt not reach the child as well. detached => child is a diff process group
              // https://nodejs.org/api/child_process.html#child_process_options_detached
            }
          );

          process.stdin.pipe(self.#engineProcess.stdin!);
          process.on("SIGINT", () => {
            self.stop("SIGINT was received");
          });

          let loggerWritable = new stream.Writable({
            write: function (chunk, _, next) {
              // delay the log lines by 1 sec. if we dont do this, events are generated for streams even before they get added to the streamsMap
              setTimeout(() => {
                try {
                  // chunk can contain multiple json log lines
                  chunk
                    .toString()
                    .trim()
                    .split("\n")
                    .forEach((str: string) => {
                      // hack: sometimes benthos sends null so skip it
                      if (str !== "null") {
                        // let j: { level: string, stream?: any, msg: string, time: string } = { level: "", msg: "", time: getISOStringLocalTz() }
                        let j: Omit<EventObj, "stream"> & { stream?: any } = {
                          level: "",
                          msg: "",
                          time: getISOStringLocalTz(),
                        };

                        try {
                          // parse and add stream object instead of just the ID
                          j = JSON.parse(str);
                          j.stream = self.#streamsMap[j.stream]
                            ? self.#streamsMap[j.stream]
                            : j.stream;
                          str = JSON.stringify(j);

                          //TODO: check if j contains "stream", if not then events below should change to engine.info etc.
                        } catch (error) {
                          // do nothing, so it will fall into switch.default
                        }
                        switch (j.level) {
                          case "off":
                          case "none":
                            break;
                          case "fatal":
                            j.error = { message: j.msg };
                            self.emit(
                              self.engineEvents["engineProcess.stream.fatal"],
                              j
                            );
                            break;
                          case "error":
                            j.error = { message: j.msg };
                            self.emit(
                              self.engineEvents["engineProcess.stream.error"],
                              j
                            );
                            break;
                          case "warn":
                          case "warning":
                            j.error = { message: j.msg };
                            self.emit(
                              self.engineEvents["engineProcess.stream.warn"],
                              j
                            );
                            break;
                          case "info":
                            self.emit(
                              self.engineEvents["engineProcess.stream.info"],
                              j
                            );
                            break;
                          case "debug":
                            self.emit(
                              self.engineEvents["engineProcess.stream.debug"],
                              j
                            );
                            break;
                          case "trace":
                            self.emit(
                              self.engineEvents["engineProcess.stream.trace"],
                              j
                            );
                            break;
                          default: // isnt a log line. v likely an output.stdout/err
                            // case "all" goes here
                            console.log(str);
                            break;
                        }
                      }
                    });
                } catch (e: any) {
                  self.emit(self.engineEvents["engine.error"], {
                    msg: "unable to write engineProcess events into loggerWritable",
                    error: formatErrorForEvent(e),
                    time: getISOStringLocalTz(),
                  });
                }
              }, 0); // 1000);

              next();
            },
          });
          self.#engineProcess.stdout?.pipe(loggerWritable);
          self.#engineProcess.stderr?.pipe(loggerWritable);

          self.#engineProcess.catch((e) => {
            if (e.killed && e.isCanceled) {
              // abort was used
              self.emit(self.engineEvents["engine.inactive"], {
                msg: "aborted successfully",
                time: getISOStringLocalTz(),
              });
            } else if (e.all) {
              self.emit(self.engineEvents["engine.fatal"], {
                msg: "engineProcess exited unexpectedly (1)",
                error: formatErrorForEvent(e),
                time: getISOStringLocalTz(),
              });
            } else {
              self.emit(self.engineEvents["engine.fatal"], {
                msg: "engineProcess exited unexpectedly (2)",
                error: formatErrorForEvent(e),
                time: getISOStringLocalTz(),
              });
            }
          });

          // wait for the engineProcess to spawn
          await once(self.#engineProcess, "spawn");
          // wait for ping to work after spawn, only then mark active and start mgmt events
          try {
            await self._apiGetPing({ "axios-retry": { retries: 3 } });
            self.emit(self.engineEvents["engine.active"], {
              msg: "engineProcess=isLocal. first ping pass & marked active",
              time: getISOStringLocalTz(),
            });
          } catch (e) {
            self.emit(self.engineEvents["engine.fatal"], {
              msg: "engineProcess=isLocal. first ping failed",
              error: formatErrorForEvent(e),
              time: getISOStringLocalTz(),
            });
            return self;
          }
          // self._startMgmtEvents()
        } else {
          // remote servier, so nothing to
          self.#debugLog("isLocal=false");
          try {
            await self._apiGetPing({ "axios-retry": { retries: 3 } });
            self.emit(self.engineEvents["engine.active"], {
              msg: "engineProcess<>isLocal. first ping pass & marked active",
              time: getISOStringLocalTz(),
            });
          } catch (e) {
            self.emit(self.engineEvents["engine.fatal"], {
              msg: "engineProcess<>isLocal. first ping failed",
              error: formatErrorForEvent(e),
              time: getISOStringLocalTz(),
            });
            return self;
          }
          // self._startMgmtEvents()
        }

        if (self.numStreams > 0) {
          await self.add(...Object.values(self.#streamsMap));
        }

        self.#startMgmtEvents();
        self.#debugLog(
          "waiting for event=engine.active before finish of start"
        );
        await EventEmitter2.once(self, self.engineEvents["engine.active"]);
        // start the _keepAliveInterval
        self.#keepAliveInterval = setInterval(() => {}, 1 << 30);
        return self;
      });
    } catch (e: any) {
      self.emit(self.engineEvents["engine.fatal"], {
        msg: "start failed",
        error: formatErrorForEvent(e),
        time: getISOStringLocalTz(),
      });
      return self;
    }
  }

  /**
   * stop the engine and all its streams
   * TODO: verify that stream closes gracefully else revert to execa kill("SIGTERM")
   */
  async stop(): Promise<Engine>;
  async stop(reason: string): Promise<Engine>;
  async stop(reason: string, force: boolean): Promise<Engine>;
  async stop(reason?: string, force?: boolean): Promise<Engine> {
    if (reason === undefined) {
      reason = "";
    }
    if (force === undefined) {
      force = false;
    }
    let self = this;
    let caller = getCaller();
    self.#traceLog(`stop called from: ${caller}`);

    try {
      return await self.#engineConstrStartStopMutex.runExclusive(async () => {
        self.#traceLog(`stop mutex acquired from: ${caller}`);
        // if engine is not active, wait for it
        if (!self.#isActive) {
          self.#debugLog(
            `waiting for event=engine.active for ${self.waitForActiveEventMs} seconds before stopping`
          );
          try {
            await self.waitFor(
              self.engineEvents["engine.active"],
              self.waitForActiveEventMs
            );
          } catch (e) {
            self.#debugLog("engine isActive=false, skipping stopping");
            clearInterval(self.#keepAliveInterval);
            return self;
          }
        }

        // is active at this point

        // remove all streams first
        self.#debugLog("removing all streams before stopping");
        await self.remove();

        if (self.#engineExtraConfig.isLocal) {
          // remove the engine config file
          await fs.promises.unlink(self.#engineConfigFilePath);
          // fs.unlinkSync(self.#engineConfigFilePath);

          if (force) {
            self.#abortController.abort();
          } else {
            // using SIGTERM (or SIGNIT [benthos behaves the same]) instead of abort signal
            self.#engineProcess.kill("SIGTERM", {
              forceKillAfterTimeout:
                parseInt(self.#engineConfig.shutdown_timeout, 10) + 1, // 1 second of extra buffer time
            });
          }
        }

        // perform regardless of local or not
        clearInterval(self.#keepAliveInterval);
        self.emit(self.engineEvents["engine.inactive"], {
          msg: `stopped successfully` + (reason ? ". reason:" + reason : ""),
          time: getISOStringLocalTz(),
        });
        return self;
      });
    } catch (e: any) {
      self.emit(self.engineEvents["engine.fatal"], {
        msg: "stop failed. performing process.exit",
        error: formatErrorForEvent(e),
        time: getISOStringLocalTz(),
      });
      process.exit(1);
    }
  }

  async #startMgmtEvents() {
    let self = this;
    let caller = getCaller();
    self.#traceLog(`_startMgmtEvents called from: ${caller}`);

    let shutDownTimer: NodeJS.Timer;
    do {
      try {
        if (!self.#isActive) {
          self.#debugLog("engine is not active. existing mgmt event loop");
          if (shutDownTimer!) {
            clearTimeout(shutDownTimer!); // to clearTimout if a stream existed since the timeout was started
            shutDownTimer!.unref();
          }
          break;
        }
        // shutdown if no streams running for
        if (!self.#engineExtraConfig.keepAlive) {
          if (
            self.numStreams === 0 &&
            !(shutDownTimer! !== undefined && shutDownTimer!.hasRef())
          ) {
            // schedule to stop engine after n seconds ONLY if numStreams is till 0
            self.#debugLog(
              `engine.stop will be called if no streams exist for the next ${
                self.#shutdownAfterInactivityFor
              }ms`
            );
            shutDownTimer = setTimeout(() => {
              if (self.numStreams === 0) {
                self.stop(
                  `no streams for the last ${
                    self.#shutdownAfterInactivityFor
                  }ms`
                );
              }
            }, self.#shutdownAfterInactivityFor);
          } else if (
            self.numStreams > 0 &&
            shutDownTimer! !== undefined &&
            shutDownTimer!.hasRef()
          ) {
            clearTimeout(shutDownTimer!); // to clearTimout if a stream existed since the timeout was started
            shutDownTimer!.unref();
          }
        }
        /**
         * ping
         */
        // if engine is not active, wait for it

        // if (!self._isActive) {
        //     self._debug("waiting for event=engine.active before ping")
        //     await EventEmitter2.once(self, self.engineEvents["engine.active"])
        // }
        try {
          await self._apiGetPing({ "axios-retry": { retries: 0 } });
        } catch (e) {
          self.emit(self.engineEvents["engine.inactive"], {
            msg: "ping failed",
            time: getISOStringLocalTz(),
          });
          throw e;
        }
        self.emit(self.engineEvents["engine.active"], {
          msg: "ping success",
          time: getISOStringLocalTz(),
        });

        /**
         * stream cleanup
         */
        for (let stream of Object.values(self.#streamsMap)) {
          // if engine is not active, wait for it
          if (!self.#isActive) {
            self.#debugLog("waiting for event=engine.active before cleanup");
            await EventEmitter2.once(self, self.engineEvents["engine.active"]);
          }
          let resp = await self._apiGetStreamReady(stream, {
            validateStatus: (status) => {
              return status < 400 || status === 503;
            },
          });
          if (resp.status === 503) {
            // cleanup
            // self.emit(self.engineEvents["engineProcess.stream.fatal"], { msg: "stream status is not ready", error: formatErrorForEvent(new Error(resp.data || "reason unknown")), stream, time: getISOStringLocalTz() })
            let msg = `stream status equals/changed to not-ready: ${
              resp.data || "reason unknown"
            }. removing stream`;
            self.emit(self.engineEvents["engineProcess.stream.warn"], {
              msg,
              stream,
              error: formatErrorForEvent(new Error(msg)),
              time: getISOStringLocalTz(),
            });
            self.remove(msg, stream);
          }
        }
      } catch (e: any) {
        self.emit(self.engineEvents["engine.error"], {
          msg: "unable to start mgmt events",
          error: formatErrorForEvent(e),
          time: getISOStringLocalTz(),
        });
      }
    } while (await sleep(self.#mgmtEventsFreqMs)); //2000
  }

  /**
   * adds one or more streams to the engine
   * @param stream
   */
  public async add(...streams: Stream[]): Promise<Engine> {
    let self = this;
    let caller = getCaller();
    self.#traceLog(`add called from: ${caller}`);

    try {
      return await self.#engineStreamAddUpdateRemoveMutex.runExclusive(
        async () => {
          self.#traceLog(`add mutex acquired from: ${caller}`);
          self.#debugLog(
            `add called for streams: ${streams.map((s) => s.streamID)}`
          );

          if (!self.#isActive) {
            self.#debugLog(
              `waiting for event=engine.active for ${self.waitForActiveEventMs} seconds before adding`
            );
            try {
              await self.waitFor(
                self.engineEvents["engine.active"],
                self.waitForActiveEventMs
              );
            } catch (e) {
              self.#debugLog(
                "engine isActive=false, skipping adding/_apiPostStream"
              );
              return self;
            }
          }

          for (let stream of streams) {
            try {
              if (stream.hasInport) {
                stream.createInport();
              }
              if (stream.hasOutport) {
                stream.createOutport();
              }

              // best practice
              await stream.beforeAdd();

              await self._apiPostStream(stream);
              self.#streamsMap[stream.streamID] = stream;
              this.emit(self.engineEvents["engine.stream.add"], {
                msg: `stream added to engine`,
                stream,
                time: getISOStringLocalTz(),
              });
            } catch (e: any) {
              self.emit(self.engineEvents["engine.stream.error"], {
                msg: `stream add to engine failed`,
                error: formatErrorForEvent(e),
                stream,
                time: getISOStringLocalTz(),
              });
            }
          }
          return self;
        }
      );
    } catch (e: any) {
      self.emit(self.engineEvents["engine.error"], {
        msg: `engine unable to add any streams`,
        error: formatErrorForEvent(e),
        time: getISOStringLocalTz(),
      });
      return self;
    }
  }

  /**
   * updates one or more existing streams on the engine
   * @param stream
   * @returns
   */
  public async update(...streams: Stream[]): Promise<Engine> {
    let self = this;
    let caller = getCaller();
    self.#traceLog(`update called from: ${caller}`);

    try {
      return await self.#engineStreamAddUpdateRemoveMutex.runExclusive(
        async () => {
          self.#traceLog(`update mutex acquired from: ${caller}`);
          self.#debugLog(
            `update called for streams: ${streams.map((s) => s.streamID)}`
          );
          if (!self.#isActive) {
            self.#debugLog(
              `waiting for event=engine.active for ${self.waitForActiveEventMs} seconds before updating`
            );
            try {
              await self.waitFor(
                self.engineEvents["engine.active"],
                self.waitForActiveEventMs
              );
            } catch (e) {
              self.#debugLog(
                "engine isActive=false, skipping update/_apiPutStream"
              );
              return self;
            }
          }

          for (let stream of streams) {
            try {
              await self._apiPutStream(stream);
              self.#streamsMap[stream.streamID] = stream;
              this.emit(self.engineEvents["engine.stream.update"], {
                msg: `stream updated to engine`,
                stream,
                time: getISOStringLocalTz(),
              });
            } catch (e: any) {
              self.emit(self.engineEvents["engine.stream.error"], {
                msg: "stream update to engine failed",
                error: formatErrorForEvent(e),
                stream,
                time: getISOStringLocalTz(),
              });
            }
          }
          return self;
        }
      );
    } catch (e: any) {
      self.emit(self.engineEvents["engine.error"], {
        msg: `engine unable to update any streams`,
        error: formatErrorForEvent(e),
        time: getISOStringLocalTz(),
      });
      return self;
    }
  }

  /**
   * removes a stream from the engine
   * no parameters => all added streams will be removed
   */
  public async remove(): Promise<Engine>;
  public async remove(...streams: Stream[]): Promise<Engine>;
  public async remove(reason: string, ...streams: Stream[]): Promise<Engine>;
  public async remove(...streamsWWOReason: any[]): Promise<Engine> {
    let reason: string = "";
    let streams: Stream[];
    if (typeof streamsWWOReason[0] === "string") {
      reason = streamsWWOReason[0];
      streams = streamsWWOReason.slice(1);
    } else {
      streams = streamsWWOReason;
    }

    let self = this;
    let caller = getCaller();
    self.#traceLog(`remove called from: ${caller}`);

    try {
      return await self.#engineStreamAddUpdateRemoveMutex.runExclusive(
        async () => {
          self.#traceLog(`remove mutex acquired from: ${caller}`);
          if (streams.length === 0) {
            streams = Object.values(this.#streamsMap);
          }
          self.#debugLog(
            `remove called for streams: ${streams.map((s) => s.streamID)}`
          );

          if (!self.#isActive) {
            self.#debugLog(
              `waiting for event=engine.active for ${self.waitForActiveEventMs} seconds before removing`
            );
            try {
              await self.waitFor(
                self.engineEvents["engine.active"],
                self.waitForActiveEventMs
              );
            } catch (e) {
              self.#debugLog(
                "engine isActive=false, skipping removing/_apiDeleteStream"
              );
              return self;
            }
          }

          if (streams.length === 0) {
            self.#debugLog("no stream to remove");
          }
          for (let stream of streams) {
            try {
              if (!self.#streamsMap[stream.streamID]) {
                self.#debugLog(
                  `stream [ID=${stream.streamID}] not present in engine streamMap. possibly already removed`
                );
                continue;
              }

              // best practice
              await stream.afterRemove();

              await self._apiDeleteStream(stream);

              // if hasOutProc close it, to clean the sock
              // i.e. close actually removes the .sock file
              if (stream.hasOutport) {
                stream.outport.close();
              }
              if (stream.hasInport) {
                stream.inport.close();
              }

              delete self.#streamsMap[stream.streamID];
              self.emit(self.engineEvents["engine.stream.remove"], {
                msg: `stream removed from engine ${
                  reason ? "reason:" + reason : ""
                }`,
                stream,
                time: getISOStringLocalTz(),
              });
            } catch (e: any) {
              self.emit(self.engineEvents["engine.stream.error"], {
                msg: "stream remove from engine failed",
                error: formatErrorForEvent(e),
                stream,
                time: getISOStringLocalTz(),
              });
            }
          }

          return self;
        }
      );
    } catch (e: any) {
      self.emit(self.engineEvents["engine.error"], {
        msg: `engine unable to remove any streams`,
        error: formatErrorForEvent(e),
        time: getISOStringLocalTz(),
      });
      return self;
    }
  }

  static #writeToEngineConfigFilePath(this: Engine) {
    let self = this;
    let caller = getCaller();
    self.#traceLog(`writeToEngineConfigFilePath called from: ${caller}`);

    try {
      fs.writeFileSync(
        this.#engineConfigFilePath,
        JSON.stringify(this.#engineConfig)
      );
      self.#debugLog(
        `engine config successfully written to: ${this.#engineConfigFilePath}`
      );
    } catch (e) {
      let msg = `failed to write engine config into ${
        this.#engineConfigFilePath
      }}`;
      self.emit(self.engineEvents["engine.fatal"], {
        msg,
        error: formatErrorForEvent(e),
        time: getISOStringLocalTz(),
      });
    }
  }

  /**
   * The default event hander prints all events on the console/stdout. Additionally, it:
   * - stops the stream on receiving an "engineProcess.stream.error" event 5 times
   * @param this Engine
   * @param eventName the name of the event
   * @param eventObj the event object of type EventObj containing event information
   */
  static #defaultEngineEventHandler = (function () {
    let streamErrorCounter: { [streamID: string]: any } = {}; // streamID to count
    return function (
      this: Engine,
      eventName: string | string[],
      eventObj: EventObj
    ) {
      let self = this;

      try {
        if (eventName === "engineProcess.stream.error") {
          let streamID: string;
          if (eventObj.stream && eventObj.stream.streamID) {
            streamID = eventObj.stream.streamID;
          } else {
            streamID = "unknown";
          }
          console.log(`<event>${eventName}>${JSON.stringify(eventObj)}`);
          streamErrorCounter[streamID] = streamErrorCounter[streamID] || 0;
          streamErrorCounter[streamID] = streamErrorCounter[streamID] + 1;
          if (streamErrorCounter[streamID] === 5 && eventObj.stream) {
            // remove the stream if error received 5 times
            self.remove(eventObj.stream);
          }
        } else {
          console.log(`<event>${eventName}>${JSON.stringify(eventObj)}`);
        }
      } catch (e: any) {
        self.emit(self.engineEvents["engine.error"], {
          msg: `defaultEngineEventHandler unable to handle events`,
          error: formatErrorForEvent(e),
          time: getISOStringLocalTz(),
        });
      }
    };
  })();

  /**
   * use the default event handler, and optinally provide additional event handlers for custom logic
   * @param addnEventHandlers
   */
  public useDefaultEventHandler(
    addnEventHandlers: { [eventName: string]: ListenerFn } = {}
  ) {
    let self = this;
    self.onAny(Engine.#defaultEngineEventHandler.bind(self));
    Object.keys(addnEventHandlers).forEach((eventName) => {
      self.on(eventName, addnEventHandlers[eventName]);
    });
  }
}

export { Engine };
