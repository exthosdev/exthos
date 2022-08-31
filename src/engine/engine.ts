import * as path from "path";
import { tmpdir } from "os";
import * as fs from "fs";
import { randomUUID } from 'crypto';
import { Deferred, sleep, getISOStringLocalTz } from '../utils/utils.js';
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

type EventObj = { stream?: Stream, msg: string, time: string }

type engineEventsTypes =
    "engine.active" |
    "engine.inactive" |
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
    private readonly _engineConfigFilePath: string = path.join(tmpdir(), "exthos_engine_conf_" + randomUUID() + ".json")
    private _engineConfig!: EngineConfig
    private _engineProcess!: ExecaChildProcess<string>
    private _abortController = new AbortController();
    private _shutdownAfterInactivityFor: number = 10000              // should usually be more than self._waitForActiveEventMs
    // must be more than _mgmtEventsFreqMs
    private _mgmtEventsFreqMs: number = 2000
    public waitForActiveEventMs: number = 5000 // must be more than 2-3 secs to give time for engine to turn active
    private _keepAliveInterval!: NodeJS.Timeout //= setInterval(() => { }, 1 << 30);   // TODO: this should only be used in remote mode

    /**
     * debug is used heavily; 
     * exthos:engine:log - give general debug logs
     * exthos:engine:event - print all the events as they are emitted
     * exthos:engine:trace - prints trace information showing flow of code
     */
    private _debug = debug("exthos").extend("engine")
    private _debugLog = this._debug.extend("debugLog")
    private _traceLog = this._debug.extend("traceLog")    // used to print trace lines e.g. line numbers
    private _eventLog = this._debug.extend("eventLog")    // used to print trace lines e.g. line numbers
    private _eventNameToEventLog: Partial<Record<engineEventsTypes, debug.Debugger>> = {}   // used to set the debug extend only once per eventName

    private _isActive: boolean = false                              // engine uses the /ping api to change this state
    private _engineInitStartStopMutex = new Mutex()
    private _engineStreamAddUpdateRemoveMutex = new Mutex()

    private _isLocal: boolean = true
    private _debugNamespace: string = ""
    private _scheme: "http" | "https" = "http"
    private _tempLocalServer!: net.Server     // used to verify the IP and Port
    private _streamsMap: { [key: string]: Stream } = {}

    #benthosEXEFullPath: string = "/tmp"

    public engineEvents = engineEventsEnums

    // override emit to allow only engineEventsTypes
    public emit: (event: engineEventsTypes, eventObj: EventObj, ...values: any[]) => boolean =
        (event: engineEventsTypes, eventObj: EventObj, ...values: any[]) => {
            let self = this
            if (!self._eventNameToEventLog[event]) {
                self._eventNameToEventLog[event] = self._eventLog.extend(event)
            }
            self._eventNameToEventLog[event]!(JSON.stringify(eventObj))

            // self._eventLog(JSON.stringify({ eventName: event, eventObj }))
            return super.emit(event as string, eventObj, ...values)
        }

    public get numStreams(): number {
        try {
            return Object.keys(this._streamsMap).length
        } catch (error) {
            return 0
        }
    }

    setEngineConfigOptions(engineConfig?: Partial<EngineConfig>, engineOpts?: { isLocal?: boolean, debugNamespace?: string }) {
        let self = this
        self._debugLog(`setEngineConfigOptions called from: ${((new Error().stack as any).split("at ")[2]).trim()}`)
        // take care of engineOpts
        if (engineOpts === undefined) {
            engineOpts = {}
        }
        if (engineOpts.isLocal === undefined) {
            engineOpts.isLocal = true
        }
        this._isLocal = engineOpts.isLocal

        if (engineOpts.debugNamespace === undefined) {
            engineOpts.debugNamespace = ""
        }
        this._debugNamespace = engineOpts.debugNamespace
        // add this._debugNamespace to existing debug namespace

        if (this._debugNamespace) {
            let prevNamespaces = debug.disable()
            debug.enable([prevNamespaces, this._debugNamespace].join(","));
        }

        // take care of engineConfig
        if (this._engineConfig === undefined) {
            this._engineConfig = { ...defaultEngineConfig, ...engineConfig } // shallow assign/merge
        } else {
            this._engineConfig = { ...defaultEngineConfig, ...this._engineConfig, ...engineConfig } // shallow assign/merge
        }
        this._debugLog("received engineConfig:\n", JSON.stringify(engineConfig, null, 0))
        this._writeToEngineConfigFilePath()
        this._debugLog("sanitized engineConfig:\n", JSON.stringify(this._engineConfig, null, 0))

        this._scheme = (this._engineConfig.http.cert_file && this._engineConfig.http.key_file) ? "https" : "http"
        this._axiosInstance = axios.create({ baseURL: `${this._scheme}://${this._engineConfig.http.address}` })
        axiosRetry(this._axiosInstance, {
            retries: 3,
            retryDelay: axiosRetry.exponentialDelay,
            onRetry: (retryCount, err, requestConfig) => {
                this._debugLog(`retrying (do not panic): ${requestConfig.url}`, JSON.stringify({ retryCount: retryCount, error: err.toJSON() }))
            }
        });
    }

    /**
     * 
     * @param engineConfig 
     * @param engineOpts 
     *  isLocal is defaulted to true
     */
    constructor(engineConfig?: Partial<EngineConfig>, engineOpts?: { isLocal?: boolean, debugNamespace?: string }) {
        // TODO: , autostart?: boolean
        super()
        let self = this
        self._traceLog(`constructor called from: ${((new Error().stack as any).split("at ")[2]).trim()}`)

        self._engineInitStartStopMutex.runExclusive(() => {

            this.setEngineConfigOptions(engineConfig, engineOpts)
            let self = this

            // engine.active/inactive to mutate the isActive on the engine        
            self.on(self.engineEvents["engine.active"], () => {
                self._isActive = true
            })
            self.on(self.engineEvents["engine.inactive"], () => {
                self._isActive = false
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

    /**
     * start the engine, and the streams already added to it.
     * for remote engines, it will start the mgmt process e.g. ping, cleanup etc.
     * @returns 
     */
    async start(): Promise<Engine> {
        let self = this
        self._traceLog(`start called from: ${((new Error().stack as any).split("at ")[2]).trim()}`)

        return await self._engineInitStartStopMutex.runExclusive(async () => {
            if (this._isActive) {
                // make sure engine is started after a mutex is acquired
                self._debugLog("engine isActive=true, ignoring the call to start()")
                return self
            }

            try {
                if (this._isLocal) {
                    self._debugLog("isLocal=true")
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
                        self._debugLog(`${self.#benthosEXEFullPath} exists. will be using it.`)
                    } catch (e) {
                        try {
                            let benthosURL = `https://github.com/benthosdev/benthos/releases/download/${benthosTag}/${benthosFileName + ".tar.gz"}`
                            self._debugLog(`${self.#benthosEXEFullPath} doesnt exist`)
                            self._debugLog(`downloading archive from: ${benthosURL}`)
                            let resp = await axios.get(benthosURL, { responseType: 'stream' })
                            await streamPromises.pipeline(resp.data, fs.createWriteStream(benthosArchiveFullPath))
                            self._debugLog(`extracting archive ${benthosArchiveFullPath}`)
                            execaCommandSync(`tar xzvf ${benthosArchiveFullPath} -C ${benthosDir} benthos`)
                            execaCommandSync(`mv ${path.join(benthosDir, "benthos")} ${path.join(benthosDir, benthosFileName)}`)
                            fs.chmodSync(self.#benthosEXEFullPath, "0777")
                            self._debugLog(`benthos installation completed`)
                        } catch (e: any) {
                            let msg = "benthos cannot be installed: " + e.message
                            self.emit(self.engineEvents["engine.fatal"], { msg, time: getISOStringLocalTz() }) // TODO: change to error along with the 3
                            return self
                        }
                    }
                    /**
                     * CHECK #2 tempLocalServer check
                     */
                    try {


                        // check if address is local and we can bind to it
                        self._debugLog("creating tempLocalServer to establish ADDR, PORT availability")
                        self._tempLocalServer = net.createServer()
                        let host = self._engineConfig.http.address.split(":")[0]
                        let port = self._engineConfig.http.address.split(":")[1]

                        // _tempLocalServer listening event
                        let isListeningDeferred = new Deferred()
                        self._tempLocalServer.on("listening", () => {
                            isListeningDeferred.resolve("deferred_listening")
                            self._debugLog("tempLocalServer is listening")
                        })

                        // _tempLocalServer error event
                        // let _tempLocalServerError
                        let isErrorDeferred = new Deferred()    // hack: using this because `once(self._tempLocalServer, "error")` is not working with Promise.race
                        self._tempLocalServer.on("error", (e: any) => {
                            if (!e) {
                                isErrorDeferred.resolve()
                            } else {
                                self._debugLog("tempLocalServer errored out", e)
                                // self.emit(self.engineEvents["engine.error"], { msg: `unable to start tempLocalServer ${e.code ? e.code : ""} ${e.message ? e.message : ""}` })
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
                        self._tempLocalServer.listen(parseInt(port, 10), host, () => { })
                        await raceProm

                        // _tempLocalServer.close
                        let isCloseErrorDeferred = new Deferred()
                        self._tempLocalServer.close((e: any) => {
                            if (!e) {
                                self._tempLocalServer.unref();
                                isCloseErrorDeferred.resolve()
                            } else {
                                self._debugLog("tempLocalServer errored out", e)
                                self.emit(self.engineEvents["engine.error"], { msg: `unable to close tempLocalServer ${e.code ? e.code : ""} ${e.message ? e.message : ""}`, time: getISOStringLocalTz() })
                                isCloseErrorDeferred.reject(e)
                            }
                        })

                        await isCloseErrorDeferred.promise
                        self._debugLog("tempLocalServer closed, i.e. listening=", self._tempLocalServer.listening)
                    } catch (e: any) {
                        self.emit(self.engineEvents["engine.fatal"], { msg: `unable to start tempLocalServer ${e.code ? e.code : ""} ${e.message ? e.message : ""}`, time: getISOStringLocalTz() })
                        return self
                    }

                    // self._engineProcess = execaCommand(`benthos -c ${self._engineConfigFilePath} streams`, {
                    self._engineProcess = execaCommand(`${self.#benthosEXEFullPath} -c ${self._engineConfigFilePath} streams`, {
                        signal: self._abortController.signal,
                        buffer: false,
                        detached: true  // so that SIGINT on parent doesnt not reach the child as well. detached => child is a diff process group
                        // https://nodejs.org/api/child_process.html#child_process_options_detached
                    })

                    self._engineProcess.catch((e) => {
                        if (e.killed && e.isCanceled) {
                            // abort was used
                            self.emit(self.engineEvents["engine.inactive"], { msg: "aborted successfully", time: getISOStringLocalTz() })
                        } else if (e.all) {
                            self.emit(self.engineEvents["engine.fatal"], { msg: e?.shortMessage || e?.message, time: getISOStringLocalTz() })
                        } else {
                            self.emit(self.engineEvents["engine.fatal"], { msg: e?.shortMessage || e?.message, time: getISOStringLocalTz() })
                        }
                    })

                    process.stdin.pipe(self._engineProcess.stdin!)
                    process.on('SIGINT', () => { self.stop("SIGINT was received") });

                    let loggerWritable = new stream.Writable({
                        write: function (chunk, _, next) {
                            // delay the log lines by 1 sec. if we dont do this, events are generated for streams even before they get added to the streamsMap
                            setTimeout(() => {
                                // chunk can contain multiple json log lines
                                chunk.toString().trim().split("\n").forEach((str: string) => {
                                    let j: { level: string, stream?: any, msg: string, time: string } = { level: "", msg: "", time: getISOStringLocalTz() }
                                    try {
                                        // parse and add stream object instead of just the ID
                                        j = JSON.parse(str)
                                        j.stream = self._streamsMap[j.stream] ? self._streamsMap[j.stream] : j.stream
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
                                            debug("exthos").extend("engineProcess:fatal")(str.trim())
                                            self.emit(self.engineEvents["engine.stream.fatal"], j)
                                            break;
                                        case "error":
                                            debug("exthos").extend("engineProcess:error")(str.trim())
                                            self.emit(self.engineEvents["engine.stream.error"], j)
                                            break;
                                        case "warn":
                                        case "warning":
                                            debug("exthos").extend("engineProcess:warn")(str.trim())
                                            self.emit(self.engineEvents["engine.stream.warn"], j)
                                            break;
                                        case "info":
                                            debug("exthos").extend("engineProcess:info")(str.trim())
                                            self.emit(self.engineEvents["engine.stream.info"], j)
                                            break;
                                        case "debug":
                                            debug("exthos").extend("engineProcess:debug")(str.trim())
                                            self.emit(self.engineEvents["engine.stream.debug"], j)
                                            break;
                                        case "trace":
                                            debug("exthos").extend("engineProcess:trace")(str.trim())
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
                    self._engineProcess.stdout?.pipe(loggerWritable)
                    self._engineProcess.stderr?.pipe(loggerWritable)

                    // wait for the engineProcess to spawn
                    await once(self._engineProcess, "spawn")
                    // wait for ping to work after spawn, only then mark active and start mgmt events
                    try {
                        await self._apiGetPing({ "axios-retry": { retries: 3 } })
                        self.emit(self.engineEvents["engine.active"], { msg: "engineProcess=isLocal. first ping pass & marked active", time: getISOStringLocalTz() })
                    } catch (e) {
                        self.emit(self.engineEvents["engine.fatal"], { msg: "engineProcess=isLocal. first ping failed", time: getISOStringLocalTz() })
                        return self
                    }
                    // self._startMgmtEvents()

                } else {
                    // remote servier, so nothing to 
                    self._debugLog("isLocal=false")
                    try {
                        await self._apiGetPing({ "axios-retry": { retries: 3 } })
                        self.emit(self.engineEvents["engine.active"], { msg: "engineProcess<>isLocal. first ping pass & marked active", time: getISOStringLocalTz() })
                    } catch (e) {
                        self.emit(self.engineEvents["engine.fatal"], { msg: "engineProcess<>isLocal. first ping failed", time: getISOStringLocalTz() })
                        return self
                    }
                    // self._startMgmtEvents()
                }

                if (self.numStreams > 0) {
                    await self.add(...Object.values(self._streamsMap))
                }

                self._startMgmtEvents()
                self._debugLog("waiting for event=engine.active before finish of start")
                await EventEmitter2.once(self, self.engineEvents["engine.active"])
                // start the _keepAliveInterval
                self._keepAliveInterval = setInterval(() => { }, 1 << 30);
                return self
            } catch (e: any) {
                self.emit(self.engineEvents["engine.fatal"], { msg: `start failed: ${e.message}`, time: getISOStringLocalTz() })
                self._debugLog("start failed, stopping engine", e)
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
        self._traceLog(`stop called from: ${((new Error().stack as any).split("at ")[2]).trim()}`)

        return await self._engineInitStartStopMutex.runExclusive(async () => {
            // if engine is not active, wait for it
            if (!self._isActive) {
                self._debugLog(`waiting for event=engine.active for ${self.waitForActiveEventMs} seconds before stopping`)
                try {
                    await self.waitFor(self.engineEvents["engine.active"], self.waitForActiveEventMs) // TODO test: is it 2 seconds? or ms // should be configurable                    
                } catch (e) {
                    self._debugLog("engine isActive=false, skipping stopping")
                    clearInterval(self._keepAliveInterval)
                    return self
                }
            }

            // is active at this point

            // remove all streams first
            self._debugLog("removing streams before stopping")
            await self.remove(...Object.values(self._streamsMap))

            if (self._isLocal) {
                if (force) {
                    self._abortController.abort()
                } else {
                    // using SIGTERM (or SIGNIT [benthos behaves the same]) instead of abort signal
                    self._engineProcess.kill('SIGTERM', {
                        forceKillAfterTimeout: parseInt(self._engineConfig.shutdown_timeout, 10) + 1 // 1 second of extra buffer time
                    })
                }
            }

            // perform regardless of local or not
            clearInterval(self._keepAliveInterval)
            self.emit(self.engineEvents["engine.inactive"], { msg: `stopped successfully` + (reason ? (". reason:" + reason) : ""), time: getISOStringLocalTz() })
            self._debugLog(`engine stopped successfully` + (reason ? (". reason:" + reason) : ""))
            return self
        })
    }

    private async _startMgmtEvents() {
        let self = this
        self._traceLog(`_startMgmtEvents called from: ${((new Error().stack as any).split("at ")[2]).trim()}`)

        let shutDownTimer: NodeJS.Timer
        do {
            try {
                if (!self._isActive) {
                    self._debugLog("engine is not active. existing mgmt event loop")
                    clearTimeout(shutDownTimer!) // to clearTimout if a stream existed since the timeout was started
                    shutDownTimer!.unref()
                    break;
                }
                // shutdown if no streams running for 

                if (self.numStreams === 0 && !(shutDownTimer! !== undefined && shutDownTimer!.hasRef())) {
                    // schedule to stop engine after n seconds ONLY if numStreams is till 0
                    self._debugLog(`engine.stop will be called if no streams exist for the next ${self._shutdownAfterInactivityFor}ms`)
                    shutDownTimer = setTimeout(() => {
                        if (self.numStreams === 0) {
                            self.stop(`no streams for the last ${self._shutdownAfterInactivityFor}ms`)
                        }
                    }, self._shutdownAfterInactivityFor);
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
                for (let stream of Object.values(self._streamsMap)) {
                    // if engine is not active, wait for it
                    if (!self._isActive) {
                        self._debugLog("waiting for event=engine.active before cleanup")
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
                        let msg = `stream status is not ready:` + (resp.data || "reason unknown")
                        self.emit(self.engineEvents["engine.stream.fatal"], { msg, stream, time: getISOStringLocalTz() })
                    }
                }

            } catch (e: any) {
                self.emit(self.engineEvents["engine.error"], { msg: e.message, time: getISOStringLocalTz() })
                self.stop(e.message)
                break;
            }
        } while (await sleep(self._mgmtEventsFreqMs)) //2000
    }

    // public add(...streams: Stream[]): Engine {
    //     let self = this
    //     self._trace(`add called from: ${((new Error().stack as any).split("at ")[2]).trim()}`)
    //     self._addProm(...streams)
    //     return self
    // }

    // public update(...streams: Stream[]): Engine {
    //     let self = this
    //     self._trace(`update called from: ${((new Error().stack as any).split("at ")[2]).trim()}`)
    //     self._updateProm(...streams)
    //     return self
    // }

    // public remove(...streams: Stream[]): Engine;
    // public remove(reason: string, ...streams: Stream[]): Engine;
    // public remove(...streamsWWOReason: any[]): Engine {
    //     let self = this
    //     self._trace(`remove called from: ${((new Error().stack as any).split("at ")[2]).trim()}`)
    //     self._removeProm(...streamsWWOReason)
    //     return self
    // }

    /**
     * adds one or more streams to the engine
     * @param stream 
     */
    public async add(...streams: Stream[]): Promise<Engine> {
        let self = this
        self._traceLog(`add called from: ${((new Error().stack as any).split("at ")[2]).trim()}`)

        return await self._engineStreamAddUpdateRemoveMutex.runExclusive(async () => {
            if (!self._isActive) {
                self._debugLog(`waiting for event=engine.active for ${self.waitForActiveEventMs} seconds before adding`)
                try {
                    await self.waitFor(self.engineEvents["engine.active"], self.waitForActiveEventMs)
                } catch (e) {
                    self._debugLog("engine isActive=false, skipping adding/_apiPostStream")
                    return self
                }
            }

            for (let stream of streams) {
                try {
                    await self._apiPostStream(stream)
                    self._streamsMap[stream.streamID] = stream
                    this.emit(self.engineEvents["engine.add.stream"], { msg: `stream added to engine`, stream, time: getISOStringLocalTz() })
                    self._debugLog(`stream [ID=${stream.streamID}] added to engine`)
                } catch (e: any) {
                    self._debugLog(`stream [ID=${stream.streamID}] add to engine failed`, e)
                    self.emit(self.engineEvents["engine.error.stream"], { msg: `stream add to engine failed: ${e.message}`, stream, time: getISOStringLocalTz() })
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
        self._traceLog(`update called from: ${((new Error().stack as any).split("at ")[2]).trim()}`)

        return await self._engineStreamAddUpdateRemoveMutex.runExclusive(async () => {
            if (!self._isActive) {
                self._debugLog(`waiting for event=engine.active for ${self.waitForActiveEventMs} seconds before updating`)
                try {
                    await self.waitFor(self.engineEvents["engine.active"], self.waitForActiveEventMs)
                } catch (e) {
                    self._debugLog("engine isActive=false, skipping update/_apiPutStream")
                    return self
                }
            }

            for (let stream of streams) {
                try {
                    await self._apiPutStream(stream)
                    self._streamsMap[stream.streamID] = stream
                    this.emit(self.engineEvents["engine.update.stream"], { msg: `stream updated to engine`, stream, time: getISOStringLocalTz() })
                    self._debugLog(`stream [ID=${stream.streamID}] updated to engine`)
                } catch (e: any) {
                    self._debugLog(`stream [ID=${stream.streamID}] update to engine failed`, e)
                    self.emit(self.engineEvents["engine.error.stream"], { msg: `stream update to engine failed: ${e.message}`, stream, time: getISOStringLocalTz() })
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
        self._traceLog(`_removeProm called from: ${((new Error().stack as any).split("at ")[2]).trim()}`)
        self._debugLog(`_removeProm called for streams: ${streams.map(s => s.streamID)}`)

        return await self._engineStreamAddUpdateRemoveMutex.runExclusive(async () => {
            if (!self._isActive) {
                self._debugLog(`waiting for event=engine.active for ${self.waitForActiveEventMs} seconds before removing`)
                try {
                    await self.waitFor(self.engineEvents["engine.active"], self.waitForActiveEventMs)
                } catch (e) {
                    self._debugLog("engine isActive=false, skipping removing/_apiDeleteStream")
                    return self
                }
            }

            if (streams.length === 0) {
                self._debugLog("no stream to remove")
            }
            for (let stream of streams) {
                try {
                    if (!self._streamsMap[stream.streamID]) {
                        self._debugLog(`stream [ID=${stream.streamID}] not present in engine streamMap. possibly already removed`)
                        continue;
                    }
                    await self._apiDeleteStream(stream)
                    // if hasOutProc close it, to clean the sock
                    if (stream.hasOutPort) {
                        stream.outPort.close()
                    }
                    if (stream.hasInPort) {
                        stream.inPort.close()
                    }
                    delete self._streamsMap[stream.streamID]
                    self.emit(self.engineEvents["engine.remove.stream"], { msg: `stream removed from engine ${reason ? ("reason:" + reason) : ""}`, stream, time: getISOStringLocalTz() })
                    self._debugLog(`stream [ID=${stream.streamID}] removed from engine ${reason ? ("reason:" + reason) : ""}`)
                } catch (e: any) {
                    self._debugLog(`stream [id=${stream.streamID}] remove from engine failed`, e)
                    self.emit(self.engineEvents["engine.error.stream"], { msg: `stream remove from engine failed: ${e.message}`, stream, time: getISOStringLocalTz() })
                }
            }

            return self
        })
    }

    private _writeToEngineConfigFilePath() {
        let self = this
        self._traceLog(`_writeToEngineConfigFilePath called from: ${((new Error().stack as any).split("at ")[2]).trim()}`)
        try {
            fs.writeFileSync(this._engineConfigFilePath, JSON.stringify(this._engineConfig))
        } catch (err) {
            throw new Error(`failed to write config into tmp: ${JSON.stringify(err, Object.getOwnPropertyNames(err))}`)
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

function defaultEngineEventHandler(this: Engine, eventName: string | string[], eventObj: EventObj) {
    let self = this
    if (eventName === "engine.fatal") {
        throw new Error(((eventObj)["msg"] || "engine.fatal occured, but msg was absent in the eventObj.msg") + ". engine will be stopped if was started.");
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