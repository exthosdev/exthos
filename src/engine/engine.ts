import * as path from "path";
import { tmpdir } from "os";
import * as fs from "fs";
import { randomUUID } from 'crypto';
import { Deferred, sleep, getISOStringLocalTz, getCaller, formatErrorForEvent } from '../utils/utils.js';
import { execaCommand, ExecaChildProcess, execaCommandSync } from 'execa';
import * as net from "net";
import axios from 'axios';
import axiosRetry from 'axios-retry';
import { Stream } from "../stream/stream.js";
import debug from "debug";
import * as stream from "stream";
import { promises as streamPromises } from "stream";
import { EngineProcessAPI } from "./engineProcessAPI.js";
import { once } from "events"; // TODO: remove and eventemitter2.once?
import { Mutex } from 'async-mutex';
import { clearInterval } from "timers";
import EventEmitter2 from "eventemitter2";
import merge from "lodash.merge";

/**
 * the eventObj type.
 * - an event related to the stream will contain the stream property
 * - an event related to fatal/error/warn will contain the error property
 */
type EventObj = { msg: string, time: string, stream?: Stream, error?: any, level?: string }

type engineEventsTypes =
    "engine.active" |
    "engine.inactive" |
    "engine.warn" |
    "engine.error" |
    "engine.fatal" |
    "engine.error.stream" |
    "engine.add.stream" |
    "engine.update.stream" |
    "engine.remove.stream" |

    "engine.stream.fatal" |
    "engine.stream.error" |
    "engine.stream.warn" |
    "engine.stream.info" |
    "engine.stream.debug" |
    "engine.stream.trace"
    ;

/**
 * Note: all listeners get an additional argument that specifies some details
 */
enum engineEventsEnums {
    /**
     * wildcards work
     */
    "engine.**" = "engine.**",      // both are the same
    "engine.*.*" = "engine.*.*",

    "engine.active" = "engine.active",
    "engine.inactive" = "engine.inactive",
    "engine.warn" = "engine.warn",
    "engine.error" = "engine.error",                // an error occured with the engine
    "engine.fatal" = "engine.fatal",                // engine is stopped when this event is received

    /**
     * engine events related to a stream
     * the eventObj will always contain the stream object
     */
    "engine.error.stream" = "engine.error.stream",  // an error occured with the engine while working on a stream e.g. add/update etc.
    "engine.add.stream" = "engine.add.stream",
    "engine.update.stream" = "engine.update.stream",
    "engine.remove.stream" = "engine.remove.stream",

    /**
     * events from stream's logs as they are emitted by the engineProcess
     */

    "engine.stream.fatal" = "engine.stream.fatal",      // fatal will .remove() the stream from the engine
    "engine.stream.error" = "engine.stream.error",
    "engine.stream.warn" = "engine.stream.warn",
    "engine.stream.info" = "engine.stream.info",
    "engine.stream.debug" = "engine.stream.debug",
    "engine.stream.trace" = "engine.stream.trace",
}

class Engine extends EngineProcessAPI {
    readonly #engineConfigFilePath: string = path.join(tmpdir(), "exthos_engine_conf_" + randomUUID() + ".json")
    #engineConfig!: EngineConfig
    #engineProcess!: ExecaChildProcess<string>
    #abortController = new AbortController();
    #shutdownAfterInactivityFor: number = 10000              // should usually be more than self._waitForActiveEventMs
    // must be more than _mgmtEventsFreqMs
    #mgmtEventsFreqMs: number = 2000
    public waitForActiveEventMs: number = 5000              // must be more than 2-3 secs to give time for engine to turn active
    #keepAliveInterval!: NodeJS.Timeout //= setInterval(() => { }, 1 << 30);   // TODO: this should only be used in remote mode

    /**
     * debug is used heavily; 
     * exthos:engine:log - give general debug logs
     * exthos:engine:event - print all the events as they are emitted
     * exthos:engine:trace - prints trace information showing flow of code
     */
    #debug = debug("exthos").extend("engine")
    #debugLog = this.#debug.extend("debugLog")
    #traceLog = this.#debug.extend("traceLog")    // used to print trace lines e.g. line numbers
    #eventLog = this.#debug.extend("eventLog")    // used to print trace lines e.g. line numbers
    #eventNameToEventLog: Partial<Record<engineEventsTypes, debug.Debugger>> = {}   // used to set the debug extend only once per eventName

    #isActive: boolean = false                              // engine uses the /ping api to change this state
    #engineConstrStartStopMutex = new Mutex()
    #engineStreamAddUpdateRemoveMutex = new Mutex()
    #engineUpdateConfigOptionsMutex = new Mutex()
    #constructorDone = new Deferred()

    #isLocal!: boolean
    #debugNamespace: string = ""
    #scheme: "http" | "https" = "http"
    #tempLocalServer!: net.Server     // used to verify the IP and Port
    #streamsMap: { [key: string]: Stream } = {}

    #benthosEXEFullPath: string = "/tmp"

    public engineEvents = engineEventsEnums

    /**
     * 
     * @param engineConfig 
     * @param engineOpts 
     *  isLocal is defaulted to true
     */
    constructor(engineConfig: Partial<EngineConfig> = {}, engineOpts: { isLocal?: boolean, debugNamespace?: string } = {}) {
        // TODO: , autostart?: boolean
        super()
        let self = this
        let caller = getCaller()
        self.#traceLog(`engine constructor called from: ${caller}`)

        self.#engineConstrStartStopMutex.runExclusive(() => {

            self.#traceLog(`engine constructor mutex acquired from: ${caller}`)
            try {
                // dont use updateEngineConfigOptions to bypass the _constructorDone.promise await in it
                // this.updateEngineConfigOptions(engineConfig, engineOpts).then(_ => {
                self.#setEngineConfig(engineConfig).then(_ => {
                    self.#setEngineOpts(engineOpts).then(_ => {
                        self.#createAxiosInstance().then(_ => {
                            self.#constructorDone.resolve()
                        })
                    })
                })
            } catch (e: any) {
                self.emit(self.engineEvents["engine.fatal"], { msg:"engine constructor failed", error: formatErrorForEvent(e), time: getISOStringLocalTz() })
            }

            // engine.active/inactive to mutate the isActive on the engine        
            self.on(self.engineEvents["engine.active"], () => {
                self.#isActive = true
            })
            self.on(self.engineEvents["engine.inactive"], () => {
                self.#isActive = false
            })
            self.on(self.engineEvents["engine.stream.fatal"], (eventObj: EventObj) => {
                if (eventObj.stream) {
                    self.remove(eventObj.msg, eventObj.stream)
                }
            })
            self.on(self.engineEvents["engine.fatal"], (eventObj: EventObj) => {
                self.stop(eventObj.msg)
            })

        })
    }

    // override emit to allow only engineEventsTypes
    public emit: (event: engineEventsTypes, eventObj: EventObj, ...values: any[]) => boolean =
        (event: engineEventsTypes, eventObj: EventObj, ...values: any[]) => {
            let self = this

            // eventLog the event
            if (!self.#eventNameToEventLog[event]) {
                self.#eventNameToEventLog[event] = self.#eventLog.extend(event)
            }
            self.#eventNameToEventLog[event]!(JSON.stringify(eventObj))

            // also send as an event
            return super.emit(event as string, eventObj, ...values)
        }

    public get numStreams(): number {
        try {
            return Object.keys(this.#streamsMap).length
        } catch (error) {
            return 0
        }
    }

    // External API, where client must wait for engine to be initialized (aka constructor called)
    public async updateEngineConfigOptions(receivedEngineConfig: Partial<EngineConfig> = {}, receivedEngineOpts: { isLocal?: boolean, debugNamespace?: string } = {}) {
        let self = this
        let caller = getCaller()
        self.#traceLog(`updateEngineConfigOptions called from: ${caller}`)

        await self.#constructorDone.promise
        return await self.#engineUpdateConfigOptionsMutex.runExclusive(async () => {
            self.#traceLog(`updateEngineConfigOptions mutex acquired from: ${caller}`)
            await self.#setEngineConfig(receivedEngineConfig)
            await self.#setEngineOpts(receivedEngineOpts)
        })
    }

    async #setEngineConfig(receivedEngineConfig: Partial<EngineConfig>) {
        let self = this
        self.#traceLog(`_setEngineConfig called from: ${getCaller()}`)

        try {
            if (self.#isActive) {
                throw new Error("cannot set engineConfig on an active engine")
            }

            // take care of engineConfig
            if (this.#engineConfig === undefined) {
                this.#engineConfig = merge({}, defaultEngineConfig, receivedEngineConfig) // deep merge    
            } else {
                this.#engineConfig = merge({}, defaultEngineConfig, this.#engineConfig, receivedEngineConfig)
            }

            this.#debugLog("received engineConfig:\n", JSON.stringify(receivedEngineConfig, null, 0))
            this.#debugLog("sanitized engineConfig created:\n", JSON.stringify(this.#engineConfig, null, 0))

            this.#scheme = (this.#engineConfig.http.cert_file && this.#engineConfig.http.key_file) ? "https" : "http"

        } catch (e: any) {
            self.emit(self.engineEvents["engine.warn"], { msg: "unable to update engine config. using defaultEngineConfig", error: formatErrorForEvent(e), time: getISOStringLocalTz() })
            if (this.#engineConfig === undefined) {
                this.#engineConfig = defaultEngineConfig
            }
        }
    }

    async #setEngineOpts(receivedEngineOpts: { isLocal?: boolean, debugNamespace?: string }) {
        let self = this
        self.#traceLog(`_setEngineOpts called from: ${((new Error().stack as any).split("at ")[2]).trim()}`)

        try {
            if (self.#isActive) {
                throw new Error("cannot set engineOpts on an active engine")
            }

            // take care of engineOpts
            if (receivedEngineOpts === undefined) {
                receivedEngineOpts = {}
            }
            if (receivedEngineOpts.isLocal === undefined) {
                receivedEngineOpts.isLocal = true
            }

            this.#isLocal = receivedEngineOpts.isLocal

            if (receivedEngineOpts.debugNamespace === undefined) {
                receivedEngineOpts.debugNamespace = ""
            }
            this.#debugNamespace = receivedEngineOpts.debugNamespace
            // add this._debugNamespace to existing debug namespace

            if (this.#debugNamespace) {
                let prevNamespaces = debug.disable()
                debug.enable([prevNamespaces, this.#debugNamespace].join(","));
            }
        } catch (e: any) {
            self.emit(self.engineEvents["engine.warn"], { msg: "unable to update engine options. keeping defaults", error: formatErrorForEvent(e), time: getISOStringLocalTz() })
        }
    }

    async #createAxiosInstance() {
        let self = this
        try {
            this._axiosInstance = axios.create({ baseURL: `${this.#scheme}://${this.#engineConfig.http.address}` })
            axiosRetry(this._axiosInstance, {
                retries: 3,
                retryDelay: axiosRetry.exponentialDelay,
                onRetry: (retryCount, err, requestConfig) => {
                    this.#debugLog(`retrying (do not panic): ${requestConfig.url}`, JSON.stringify({ retryCount: retryCount, error: err.toJSON() }))
                }
            });
        } catch (e: any) {
            self.emit(self.engineEvents["engine.fatal"], { msg: "unable to create axios instance", error: formatErrorForEvent(e), time: getISOStringLocalTz() })
        }
    }

    /**
     * start the engine, and the streams already added to it.
     * for remote engines, it will start the mgmt process e.g. ping, cleanup etc.
     * @returns 
     */
    public async start(): Promise<Engine> {
        let self = this
        self.#traceLog(`start called from: ${((new Error().stack as any).split("at ")[2]).trim()}`)

        return await self.#engineConstrStartStopMutex.runExclusive(async () => {
            if (this.#isActive) {
                // make sure engine is started after a mutex is acquired
                self.#debugLog("engine isActive=true, ignoring the call to start()")
                return self
            }

            try {
                if (this.#isLocal) {
                    self.#debugLog("isLocal=true")
                    /**
                     * CHECK #1 checkExeExists
                     */
                    // TODO: these must come from the config
                    let benthosTag = "v4.5.1"
                    let benthosVersion = "4.5.1"
                    let benthosOS = "linux"
                    let benthosArch = "amd64"
                    let benthosArm = ""
                    let benthosFileName = `benthos_${benthosVersion}_${benthosOS}_${benthosArch}${benthosArm}` // get this one from config as well if present
                    let benthosDir = "/tmp" // TODO: these must come from the config
                    self.#benthosEXEFullPath = path.join(benthosDir, benthosFileName)
                    let benthosArchiveFullPath = path.join(benthosDir, benthosFileName + ".tar.gz")

                    try {
                        fs.statSync(self.#benthosEXEFullPath)
                        self.#debugLog(`${self.#benthosEXEFullPath} exists. will be using it.`)
                    } catch (e) {
                        try {
                            let benthosURL = `https://github.com/benthosdev/benthos/releases/download/${benthosTag}/${benthosFileName + ".tar.gz"}`
                            self.#debugLog(`${self.#benthosEXEFullPath} doesnt exist`)
                            self.#debugLog(`downloading archive from: ${benthosURL}`)
                            let resp = await axios.get(benthosURL, { responseType: 'stream' })
                            await streamPromises.pipeline(resp.data, fs.createWriteStream(benthosArchiveFullPath))
                            self.#debugLog(`extracting archive ${benthosArchiveFullPath}`)
                            execaCommandSync(`tar xzvf ${benthosArchiveFullPath} -C ${benthosDir} benthos`)
                            execaCommandSync(`mv ${path.join(benthosDir, "benthos")} ${path.join(benthosDir, benthosFileName)}`)
                            fs.chmodSync(self.#benthosEXEFullPath, "0777")
                            self.#debugLog(`benthos installation completed`)
                        } catch (e: any) {
                            self.emit(self.engineEvents["engine.fatal"], { msg: "benthos cannot be installed", error: formatErrorForEvent(e), time: getISOStringLocalTz() }) // TODO: change to error along with the 3
                            return self
                        }
                    }
                    /**
                     * CHECK #2 tempLocalServer check
                     */
                    try {


                        // check if address is local and we can bind to it
                        self.#debugLog("creating tempLocalServer to establish ADDR, PORT availability")
                        self.#tempLocalServer = net.createServer()
                        let host = self.#engineConfig.http.address.split(":")[0]
                        let port = self.#engineConfig.http.address.split(":")[1]

                        // _tempLocalServer listening event
                        let isListeningDeferred = new Deferred()
                        self.#tempLocalServer.on("listening", () => {
                            isListeningDeferred.resolve("deferred_listening")
                            self.#debugLog("tempLocalServer is listening")
                        })

                        // _tempLocalServer error event
                        // let _tempLocalServerError
                        let isErrorDeferred = new Deferred()    // hack: using this because `once(self._tempLocalServer, "error")` is not working with Promise.race
                        self.#tempLocalServer.on("error", (e: any) => {
                            if (!e) {
                                isErrorDeferred.resolve()
                            } else {
                                self.#debugLog("tempLocalServer errored out", e)
                                isErrorDeferred.reject(e)
                            }
                        })

                        let raceProm = Promise.race([
                            isListeningDeferred.promise,
                            isErrorDeferred.promise,
                            new Promise((_, rj) => {
                                setTimeout(() => { rj("tempLocalServer timedout") }, 2000)
                            })
                        ])

                        // _tempLocalServer.listen
                        self.#tempLocalServer.listen(parseInt(port, 10), host, () => { })
                        await raceProm

                        // _tempLocalServer.close
                        let isCloseErrorDeferred = new Deferred()
                        self.#tempLocalServer.close((e: any) => {
                            if (!e) {
                                self.#tempLocalServer.unref();
                                isCloseErrorDeferred.resolve()
                            } else {
                                self.emit(self.engineEvents["engine.error"], { msg: "unable to close tempLocalServer", error: formatErrorForEvent(e), time: getISOStringLocalTz() })
                                isCloseErrorDeferred.reject(e)
                            }
                        })

                        await isCloseErrorDeferred.promise
                        self.#debugLog("tempLocalServer closed, i.e. listening=", self.#tempLocalServer.listening)
                    } catch (e: any) {
                        self.emit(self.engineEvents["engine.fatal"], { msg: "unable to start tempLocalServer", error: formatErrorForEvent(e), time: getISOStringLocalTz() })
                        return self
                    }

                    // write the engine config at this point
                    this.#writeToEngineConfigFilePath()

                    // self._engineProcess = execaCommand(`benthos -c ${self._engineConfigFilePath} streams`, {
                    self.#engineProcess = execaCommand(`${self.#benthosEXEFullPath} -w -c ${self.#engineConfigFilePath} streams`, {
                        signal: self.#abortController.signal,
                        buffer: false,
                        detached: true  // so that SIGINT on parent doesnt not reach the child as well. detached => child is a diff process group
                        // https://nodejs.org/api/child_process.html#child_process_options_detached
                    })

                    self.#engineProcess.catch((e) => {
                        if (e.killed && e.isCanceled) {
                            // abort was used
                            self.emit(self.engineEvents["engine.inactive"], { msg: "aborted successfully", time: getISOStringLocalTz() })
                        } else if (e.all) {
                            self.emit(self.engineEvents["engine.fatal"], { msg: "engineProcess exited unexpectedly (1)", error: formatErrorForEvent(e), time: getISOStringLocalTz() })
                        } else {
                            self.emit(self.engineEvents["engine.fatal"], { msg: "engineProcess exited unexpectedly (2)", error: formatErrorForEvent(e), time: getISOStringLocalTz() })
                        }
                    })

                    process.stdin.pipe(self.#engineProcess.stdin!)
                    process.on('SIGINT', () => { self.stop("SIGINT was received") });

                    let loggerWritable = new stream.Writable({
                        write: function (chunk, _, next) {
                            // delay the log lines by 1 sec. if we dont do this, events are generated for streams even before they get added to the streamsMap
                            setTimeout(() => {
                                // chunk can contain multiple json log lines
                                chunk.toString().trim().split("\n").forEach((str: string) => {
                                    // let j: { level: string, stream?: any, msg: string, time: string } = { level: "", msg: "", time: getISOStringLocalTz() }
                                    let j: Omit<EventObj, "stream"> & { stream?: any } = { level: "", msg: "", time: getISOStringLocalTz() }
                                    try {
                                        // parse and add stream object instead of just the ID
                                        j = JSON.parse(str)
                                        j.stream = self.#streamsMap[j.stream] ? self.#streamsMap[j.stream] : j.stream
                                        str = JSON.stringify(j)

                                        //TODO: check if j contains "stream", if not then events below should change to engine.info etc.
                                    } catch (error) {
                                        // do nothing, so it will fall into switch.default  
                                    }
                                    switch (j.level) {
                                        case "off":
                                        case "none":
                                            break;
                                        case "fatal":
                                            j.error = { message: j.msg }
                                            self.emit(self.engineEvents["engine.stream.fatal"], j)
                                            break;
                                        case "error":
                                            j.error = { message: j.msg }
                                            self.emit(self.engineEvents["engine.stream.error"], j)
                                            break;
                                        case "warn":
                                        case "warning":
                                            j.error = { message: j.msg }
                                            self.emit(self.engineEvents["engine.stream.warn"], j)
                                            break;
                                        case "info":
                                            self.emit(self.engineEvents["engine.stream.info"], j)
                                            break;
                                        case "debug":
                                            self.emit(self.engineEvents["engine.stream.debug"], j)
                                            break;
                                        case "trace":
                                            self.emit(self.engineEvents["engine.stream.trace"], j)
                                            break;
                                        default:
                                            // case "all" goes here
                                            console.log(str) // isnt a log line. v likely an output.stdout/err 
                                            break;
                                    }
                                })
                            }, 1000)

                            next();
                        }
                    });
                    self.#engineProcess.stdout?.pipe(loggerWritable)
                    self.#engineProcess.stderr?.pipe(loggerWritable)

                    // wait for the engineProcess to spawn
                    await once(self.#engineProcess, "spawn")
                    // wait for ping to work after spawn, only then mark active and start mgmt events
                    try {
                        await self._apiGetPing({ "axios-retry": { retries: 3 } })
                        self.emit(self.engineEvents["engine.active"], { msg: "engineProcess=isLocal. first ping pass & marked active", time: getISOStringLocalTz() })
                    } catch (e) {
                        self.emit(self.engineEvents["engine.fatal"], { msg: "engineProcess=isLocal. first ping failed", error: formatErrorForEvent(e), time: getISOStringLocalTz() })
                        return self
                    }
                    // self._startMgmtEvents()

                } else {
                    // remote servier, so nothing to 
                    self.#debugLog("isLocal=false")
                    try {
                        await self._apiGetPing({ "axios-retry": { retries: 3 } })
                        self.emit(self.engineEvents["engine.active"], { msg: "engineProcess<>isLocal. first ping pass & marked active", time: getISOStringLocalTz() })
                    } catch (e) {
                        self.emit(self.engineEvents["engine.fatal"], { msg: "engineProcess<>isLocal. first ping failed", error: formatErrorForEvent(e), time: getISOStringLocalTz() })
                        return self
                    }
                    // self._startMgmtEvents()
                }

                if (self.numStreams > 0) {
                    await self.add(...Object.values(self.#streamsMap))
                }

                self.#startMgmtEvents()
                self.#debugLog("waiting for event=engine.active before finish of start")
                await EventEmitter2.once(self, self.engineEvents["engine.active"])
                // start the _keepAliveInterval
                self.#keepAliveInterval = setInterval(() => { }, 1 << 30);
                return self
            } catch (e: any) {
                self.emit(self.engineEvents["engine.fatal"], { msg: "start failed", error: formatErrorForEvent(e), time: getISOStringLocalTz() })
                return self
            }
        })
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
            reason = ""
        }
        if (force === undefined) {
            force = false
        }
        let self = this
        self.#traceLog(`stop called from: ${((new Error().stack as any).split("at ")[2]).trim()}`)

        return await self.#engineConstrStartStopMutex.runExclusive(async () => {
            // if engine is not active, wait for it
            if (!self.#isActive) {
                self.#debugLog(`waiting for event=engine.active for ${self.waitForActiveEventMs} seconds before stopping`)
                try {
                    await self.waitFor(self.engineEvents["engine.active"], self.waitForActiveEventMs)
                } catch (e) {
                    self.#debugLog("engine isActive=false, skipping stopping")
                    clearInterval(self.#keepAliveInterval)
                    return self
                }
            }

            // is active at this point

            // remove all streams first
            self.#debugLog("removing streams before stopping")
            await self.remove(...Object.values(self.#streamsMap))


            if (self.#isLocal) {
                // remove the engine config file
                fs.unlinkSync(self.#engineConfigFilePath)

                if (force) {
                    self.#abortController.abort()
                } else {
                    // using SIGTERM (or SIGNIT [benthos behaves the same]) instead of abort signal
                    self.#engineProcess.kill('SIGTERM', {
                        forceKillAfterTimeout: parseInt(self.#engineConfig.shutdown_timeout, 10) + 1 // 1 second of extra buffer time
                    })
                }
            }

            // perform regardless of local or not
            clearInterval(self.#keepAliveInterval)
            self.emit(self.engineEvents["engine.inactive"], { msg: `stopped successfully` + (reason ? (". reason:" + reason) : ""), time: getISOStringLocalTz() })
            return self
        })
    }

    async #startMgmtEvents() {
        let self = this
        self.#traceLog(`_startMgmtEvents called from: ${((new Error().stack as any).split("at ")[2]).trim()}`)

        let shutDownTimer: NodeJS.Timer
        do {
            try {
                if (!self.#isActive) {
                    self.#debugLog("engine is not active. existing mgmt event loop")
                    clearTimeout(shutDownTimer!) // to clearTimout if a stream existed since the timeout was started
                    shutDownTimer!.unref()
                    break;
                }
                // shutdown if no streams running for 

                if (self.numStreams === 0 && !(shutDownTimer! !== undefined && shutDownTimer!.hasRef())) {
                    // schedule to stop engine after n seconds ONLY if numStreams is till 0
                    self.#debugLog(`engine.stop will be called if no streams exist for the next ${self.#shutdownAfterInactivityFor}ms`)
                    shutDownTimer = setTimeout(() => {
                        if (self.numStreams === 0) {
                            self.stop(`no streams for the last ${self.#shutdownAfterInactivityFor}ms`)
                        }
                    }, self.#shutdownAfterInactivityFor);
                } else if (self.numStreams > 0 && (shutDownTimer! !== undefined && shutDownTimer!.hasRef())) {
                    clearTimeout(shutDownTimer!) // to clearTimout if a stream existed since the timeout was started
                    shutDownTimer!.unref()
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
                    await self._apiGetPing({ "axios-retry": { retries: 0 } })
                } catch (e) {
                    self.emit(self.engineEvents["engine.inactive"], { msg: "ping failed", time: getISOStringLocalTz() })
                    throw e
                }
                self.emit(self.engineEvents["engine.active"], { msg: "ping success", time: getISOStringLocalTz() })

                /**
                 * stream cleanup
                 */
                for (let stream of Object.values(self.#streamsMap)) {
                    // if engine is not active, wait for it
                    if (!self.#isActive) {
                        self.#debugLog("waiting for event=engine.active before cleanup")
                        await EventEmitter2.once(self, self.engineEvents["engine.active"])
                    }
                    let resp = await self._apiGetStreamReady(stream, {
                        validateStatus:
                            (status) => {
                                return (status <= 400 || status === 503)
                            }
                    })
                    if (resp.status === 503) {
                        // cleanup
                        self.emit(self.engineEvents["engine.stream.fatal"], { msg: "stream status is not ready", error: formatErrorForEvent(new Error(resp.data || "reason unknown")), stream, time: getISOStringLocalTz() })
                    }
                }

            } catch (e: any) {
                self.emit(self.engineEvents["engine.error"], { msg: "unable to start mgmt events", error: formatErrorForEvent(e), time: getISOStringLocalTz() })
                self.stop(e.message)
                break;
            }
        } while (await sleep(self.#mgmtEventsFreqMs)) //2000
    }

    /**
     * adds one or more streams to the engine
     * @param stream 
     */
    public async add(...streams: Stream[]): Promise<Engine> {
        let self = this
        self.#traceLog(`add called from: ${((new Error().stack as any).split("at ")[2]).trim()}`)

        return await self.#engineStreamAddUpdateRemoveMutex.runExclusive(async () => {
            if (!self.#isActive) {
                self.#debugLog(`waiting for event=engine.active for ${self.waitForActiveEventMs} seconds before adding`)
                try {
                    await self.waitFor(self.engineEvents["engine.active"], self.waitForActiveEventMs)
                } catch (e) {
                    self.#debugLog("engine isActive=false, skipping adding/_apiPostStream")
                    return self
                }
            }

            for (let stream of streams) {
                try {
                    await self._apiPostStream(stream)
                    self.#streamsMap[stream.streamID] = stream
                    this.emit(self.engineEvents["engine.add.stream"], { msg: `stream added to engine`, stream, time: getISOStringLocalTz() })
                } catch (e: any) {
                    self.emit(self.engineEvents["engine.error.stream"], { msg: `stream add to engine failed`, error: formatErrorForEvent(e), stream, time: getISOStringLocalTz() })
                }
            }
            return self
        })
    }

    /**
     * updates one or more existing streams on the engine
     * @param stream
     * @returns 
     */
    public async update(...streams: Stream[]): Promise<Engine> {
        let self = this
        self.#traceLog(`update called from: ${((new Error().stack as any).split("at ")[2]).trim()}`)

        return await self.#engineStreamAddUpdateRemoveMutex.runExclusive(async () => {
            if (!self.#isActive) {
                self.#debugLog(`waiting for event=engine.active for ${self.waitForActiveEventMs} seconds before updating`)
                try {
                    await self.waitFor(self.engineEvents["engine.active"], self.waitForActiveEventMs)
                } catch (e) {
                    self.#debugLog("engine isActive=false, skipping update/_apiPutStream")
                    return self
                }
            }

            for (let stream of streams) {
                try {
                    await self._apiPutStream(stream)
                    self.#streamsMap[stream.streamID] = stream
                    this.emit(self.engineEvents["engine.update.stream"], { msg: `stream updated to engine`, stream, time: getISOStringLocalTz() })
                } catch (e: any) {
                    self.emit(self.engineEvents["engine.error.stream"], { msg: "stream update to engine failed", error: formatErrorForEvent(e), stream, time: getISOStringLocalTz() })
                }
            }
            return self
        })
    }

    /**
     * removes a stream from the engine
     */
    public async remove(...streams: Stream[]): Promise<Engine>;
    public async remove(reason: string, ...streams: Stream[]): Promise<Engine>;
    public async remove(...streamsWWOReason: any[]): Promise<Engine> {
        let reason: string = ""
        let streams: Stream[]
        if (typeof streamsWWOReason[0] === "string") {
            reason = streamsWWOReason[0]
            streams = streamsWWOReason.slice(1)
        } else {
            streams = streamsWWOReason
        }
        let self = this
        self.#traceLog(`_removeProm called from: ${((new Error().stack as any).split("at ")[2]).trim()}`)
        self.#debugLog(`_removeProm called for streams: ${streams.map(s => s.streamID)}`)

        return await self.#engineStreamAddUpdateRemoveMutex.runExclusive(async () => {
            if (!self.#isActive) {
                self.#debugLog(`waiting for event=engine.active for ${self.waitForActiveEventMs} seconds before removing`)
                try {
                    await self.waitFor(self.engineEvents["engine.active"], self.waitForActiveEventMs)
                } catch (e) {
                    self.#debugLog("engine isActive=false, skipping removing/_apiDeleteStream")
                    return self
                }
            }

            if (streams.length === 0) {
                self.#debugLog("no stream to remove")
            }
            for (let stream of streams) {
                try {
                    if (!self.#streamsMap[stream.streamID]) {
                        self.#debugLog(`stream [ID=${stream.streamID}] not present in engine streamMap. possibly already removed`)
                        continue;
                    }
                    await self._apiDeleteStream(stream)

                    // if hasOutProc close it, to clean the sock
                    // i.e. close actually removes the .sock file
                    if (stream.hasOutPort) {
                        stream.outPort.close()
                    }
                    if (stream.hasInPort) {
                        stream.inPort.close()
                    }

                    delete self.#streamsMap[stream.streamID]
                    self.emit(self.engineEvents["engine.remove.stream"], { msg: `stream removed from engine ${reason ? ("reason:" + reason) : ""}`, stream, time: getISOStringLocalTz() })
                } catch (e: any) {
                    self.emit(self.engineEvents["engine.error.stream"], { msg: "stream remove from engine failed", error: formatErrorForEvent(e), stream, time: getISOStringLocalTz() })
                }
            }

            return self
        })
    }

    #writeToEngineConfigFilePath() {
        let self = this
        self.#traceLog(`_writeToEngineConfigFilePath called from: ${((new Error().stack as any).split("at ")[2]).trim()}`)
        try {
            fs.writeFileSync(this.#engineConfigFilePath, JSON.stringify(this.#engineConfig))
            self.#debugLog(`engine config successfully written to: ${this.#engineConfigFilePath}`)
        } catch (err) {
            throw new Error(`failed to write engine config into ${this.#engineConfigFilePath}: ${JSON.stringify(err, Object.getOwnPropertyNames(err))}`)
        }
    }

    public useDefaultEventHandler() {
        let self = this
        self.onAny(defaultEngineEventHandler.bind(self))
    }
}

// TODO: mark optinal props with a  '?'
interface EngineConfig {
    http: {
        address: string
        enabled: true
        root_path: string
        debug_endpoints: boolean
        cert_file: string
        key_file: string
        cors: {
            enabled: boolean
            allowed_origins: string[]
        }
    }
    logger: {
        level: "FATAL" | "ERROR" | "WARN" | "INFO" | "DEBUG" | "TRACE" | "OFF" | "ALL" | "NONE"
        format: "json" | "logfmt"
        add_timestamp?: boolean
        static_fields?: {
            "@pwrdby": "exthos"
        }
    }
    metrics:
    {
        prometheus: {   // TODO: add all props and make them optional
        }
        mapping: string
    } |
    {
        json_api: {}
        mapping: string
    } |
    {
        aws_cloudwatch: {
            "a": 1
        }
        mapping: string
    } |
    {
        logger: {
            push_interval: string
            flush_metrics: boolean
        }
        mapping: string
    }
    tracer:
    {
        none: {}
    } |
    {
        jaeger: {
            aggent_address: string
            collector_url: string
            sampler_type: "const"
            flush_interval: string
        }
    },
    shutdown_timeout: string
}

let defaultEngineConfig: EngineConfig = {
    http: {
        address: "0.0.0.0:4195",
        enabled: true,
        root_path: "/exthos",
        debug_endpoints: false,
        cert_file: "",
        key_file: "",
        cors: {
            enabled: false,
            allowed_origins: []
        }
    },
    logger: {
        "level": "INFO",
        "format": "json",
        "add_timestamp": true,
        "static_fields": {
            "@pwrdby": "exthos"
        }
    },
    "metrics": {
        prometheus: {},
        mapping: ""
    },
    "tracer": {
        none: {}
    },
    "shutdown_timeout": "20s"
}

let streamErrorCounter: { [streamID: string]: any } = {} // streamID to count

/**
 * The default event hander prints all events on the console/stdout. Additionally, it:
 * - stops the engine on receiving an "engine.fatal" event
 * - stops the stream on receiving an "engine.stream.error" event 5 times
 * @param this Engine
 * @param eventName the name of the event
 * @param eventObj the event object of type EventObj containing event information
 */
function defaultEngineEventHandler(this: Engine, eventName: string | string[], eventObj: EventObj) {
    let self = this
    if (eventName === "engine.fatal") {
        console.log(`<event>${eventName}>${JSON.stringify(eventObj)}`);
        self.stop()
    } else if (eventName === "engine.stream.error") {
        let streamID: string
        if (eventObj.stream && eventObj.stream.streamID) {
            streamID = eventObj.stream.streamID
        } else {
            streamID = "unknown"
        }
        console.log(`<event>${eventName}>${JSON.stringify(eventObj)}`);
        streamErrorCounter[streamID] = streamErrorCounter[streamID] || 0
        streamErrorCounter[streamID] = streamErrorCounter[streamID] + 1
        if (streamErrorCounter[streamID] === 5 && eventObj.stream) {
            // remove the stream if error received 5 times
            self.remove(eventObj.stream)
        }
    } else {
        console.log(`<event>${eventName}>${JSON.stringify(eventObj)}`);
    }
}

export { Engine }