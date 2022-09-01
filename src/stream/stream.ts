import { execaCommand, ExecaChildProcess } from 'execa';
import { defaultInputValues } from "../defaults/defaultInputValues.js";
import { defaultOutputValues } from "../defaults/defaultOutputValues.js";
import * as path from "path";
import { tmpdir } from "os";
import * as fs from "fs";
import { randomUUID } from 'crypto';
import * as utils from '../utils/utils.js';
import { defaultProcessorValues } from '../defaults/defaultProcessorValues.js';
import debug from "debug";
import { TStreamConfig } from '../types/streamConfig.js';
import * as nanomsg from "nanomsg";
import merge from "lodash.merge";
import { TInput } from '../types/inputs.js';
import { TOutput } from '../types/outputs.js';
import { TProcessor } from '../types/processors.js';

class Stream {
    readonly #streamConfigFilePath: string = path.join(tmpdir(), "exthos_stream_conf_" + randomUUID() + ".json")
    #streamConfig: TStreamConfig
    #childProcess!: ExecaChildProcess<string>
    #abortController = new AbortController();
    hasInPort: boolean = false
    hasOutPort: boolean = false

    #debugLog = debug("exthos").extend("stream:debugLog")
    #status: "stopped" | "started" = "stopped"
    #inPort!: nanomsg.Socket // internal.Writable
    #outPort!: nanomsg.Socket // internal.Readable

    public readonly streamID: string = randomUUID()
    // public active uptime uptime_str TODO. these should be part of the stream

    get streamConfig(): TStreamConfig {
        return this.#streamConfig
    }
    set streamConfig(s: TStreamConfig) {
        this.#streamConfig = s
        this._sanitizeStreamConfigNWriteToStreamConfigFilePath()
    }

    get inPort() {
        return this.#inPort
    }

    get outPort() {
        return this.#outPort
    }

    constructor(streamConfig: TStreamConfig, autostart?: boolean) {
        this.#streamConfig = streamConfig

        if (autostart === undefined) {
            autostart = false
        }

        this.#debugLog("received streamConfig:\n", JSON.stringify(this.#streamConfig, null, 0))
        this._sanitizeStreamConfigNWriteToStreamConfigFilePath()
        this.#debugLog("sanitized streamConfig:\n", JSON.stringify(this.#streamConfig, null, 0))

        if (autostart) {
            this.start()
        }
    }

    async start() {
        try {
            if (!utils.checkExeExists()) {
                throw new Error("benthos executable not found. Kindly install benthos and add it to env path.");
            }
            if (this.#status !== "started") {
                this.#childProcess = execaCommand(`benthos -s logger.format=json -s logger.static_fields.@service=exthos -s http.enabled=false -c ${this.#streamConfigFilePath}`,
                    {
                        signal: this.#abortController.signal,
                        buffer: false,
                        detached: true
                    }
                );

                this.#childProcess.on("spawn", () => {
                    this.#debugLog("stream started successfuly")
                    this.#status = "started"
                })

                process.on('SIGINT', () => { this.stop() });
                process.stdin.pipe(this.#childProcess.stdin!)
                this.#childProcess.stdout?.pipe(process.stdout)
                this.#childProcess.stderr?.pipe(process.stderr)

                await this.#childProcess

                this.stop() // for cleanup
                this.#debugLog("stream stopped (completed) successfully")
            }
        } catch (err: any) {
            this.#status = "stopped"

            if (err.killed && err.isCanceled) {
                this.#debugLog("stream (force) stopped successfully")      // abort was used
            } else if (err.all) {
                throw new Error(`stream failed: ${err.all}`)    // errors from the childProcess
            } else {
                throw err                                       // any other errors
            }
        }
    }

    stop() {
        if (this.#status !== "stopped") {
            this.#abortController.abort()
            // if hasOutProc close it, to clean the sock
            if (this.hasOutPort) {
                this.outPort.close()
            }
            if (this.hasInPort) {
                this.inPort.close()
            }
            this.#status = "stopped"
        }
    }

    private _sanitizeStreamConfigNWriteToStreamConfigFilePath() {
        let self = this

        // TODO: use replaceKeys and replaceValueForKey for TJavascript when we workt to enhance it
        // replace TJavascript with TSubprocess in pipeline.processors
        this.#streamConfig.pipeline?.processors.forEach((processor, processorIdx) => Object.keys(processor).filter(ipo => ipo !== "label").forEach(ipo => {
            if (ipo === "javascript") {
                let jsFile = path.join(tmpdir(), "jsFile_" + randomUUID() + ".js");
                self.#debugLog("writing javascript to file:", jsFile);

                try {
                    let code = `//js code autocreated by exthos
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
                                    ${(processor as any)["javascript"]}
                                })();
                                console.log(JSON.stringify(msg))
                            } catch(e) {
                                console.error(e)
                            }
                        });
                    } catch (e) {
                        console.error(e.message)
                    }`
                    fs.writeFileSync(jsFile, code)
                } catch (err) {
                    // TODO: what to do here when the error occurs
                    throw new Error(`failed to write jsFile: ${JSON.stringify(err, Object.getOwnPropertyNames(err))}`)
                }

                (this.#streamConfig.pipeline?.processors as any)[processorIdx] = {
                    label: (this.#streamConfig.pipeline?.processors as any)[processorIdx]["label"],
                    branch: {
                        request_map: `root = {}
                            root.content = this.catch(content())
                            root.meta = meta()
                        `, // root.content = content().string().catch(content())
                        processors: [
                            {
                                subprocess: {
                                    name: "node",
                                    args: [jsFile]
                                }
                            },
                            {
                                switch: [
                                    {
                                        // console.log is not allowed inside js at the moment, so below will never be true
                                        // handles console.log when not of type {content: any, meta: any}
                                        check: `!((this.exists("content") && this.exists("meta")).catch(false))`,
                                        processors: [
                                            {
                                                log: {
                                                    // message: '${! ">>switch...2>>" + content() }'
                                                    // message: '${! ">>switch...2>>" + this.string() }'
                                                    message: '${! content() }'
                                                }
                                            },
                                        ],
                                        //fallthrough: true
                                    }
                                ]
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
                        }

                        `
                    }
                }

                delete (this.#streamConfig.pipeline?.processors as any)[processorIdx]["javascript"]
            }
        }))

        // all labels must match ^[a-z0-9_]+$ and NOT start with underscore
        // so we consvert any non compliant label by replacing those chars with an _
        utils.replaceValueForKey(this.#streamConfig, {
            "label": (existingValue: string) => {
                let newValue = existingValue.toLowerCase()  // only lowercase is allowed
                newValue = newValue.replace(/[^a-z0-9_]/g,"_"); // replace all non compliant chars with _
                newValue = newValue.replace(/^_*/g, "") // replace leading underscores if any
                return newValue
            }
        })

        // if outport exists, assign a unix socket for ipc to the value for outport
        utils.replaceValueForKey(this.#streamConfig, {
            "inport": (_: any) => {
                return {
                    urls: [`ipc:///tmp/${self.streamID}.inport.sock`],
                    bind: false
                }
            },
            "outport": (_: any) => {
                return {
                    urls: [`ipc:///tmp/${self.streamID}.outport.sock`]
                }
            }
        })

        // covert inport to nanomsg and allow write and end
        // convert outport into anomsg and allow read
        // covert direct to inproc
        utils.replaceKeys(this.#streamConfig, {
            "inport": () => {
                self.hasInPort = true;
                if (!this.#inPort) {
                    // create inPort on stream in js-land if not already created
                    this.#inPort = nanomsg.socket('push')
                    this.#inPort.bind(`ipc:///tmp/${self.streamID}.inport.sock`)
                }
                return "nanomsg"
            },
            "outport": () => {
                self.hasOutPort = true;
                if (!this.#outPort) {
                    // create outPort on stream in js-land if not already created
                    this.#outPort = nanomsg.socket('pull')
                    this.#outPort.bind(`ipc:///tmp/${self.streamID}.outport.sock`)
                }
                return "nanomsg"
            },
            "direct": () => { return "inproc" }
        })

        // apply default to input
        utils.replaceValueForKey(this.#streamConfig, {
            "input": (existingValue: TInput) => {
                let componentType = Object.keys(existingValue).filter(x => x !== "label")[0] // eg. generate
                return merge({}, { label: "", [componentType]: (defaultInputValues as any)[componentType] }, existingValue);
            }
        })

        // apply default to output
        utils.replaceValueForKey(this.#streamConfig, {
            "output": (existingValue: TOutput) => {
                let componentType = Object.keys(existingValue).filter(x => x !== "label")[0] // eg. generate
                return merge({}, { label: "", [componentType]: (defaultOutputValues as any)[componentType] }, existingValue);
            }
        })

        // apply default to processors
        utils.replaceValueForKey(this.#streamConfig, {
            "processors": (existingValues: TProcessor[]) => {
                let toReturn: TProcessor[] = []
                existingValues.forEach(existingValue => {
                    let componentType = Object.keys(existingValue).filter(x => x !== "label")[0] // eg. generate
                    toReturn.push(merge({}, { label: "", [componentType]: (defaultProcessorValues as any)[componentType] }, existingValue))
                })
                return toReturn
            }
        })

        // apply default to inputs
        utils.replaceValueForKey(this.#streamConfig, {
            "inputs": (existingValues: TInput[]) => {
                let toReturn: TInput[] = []
                existingValues.forEach(existingValue => {
                    let componentType = Object.keys(existingValue).filter(x => x !== "label")[0] // eg. generate
                    toReturn.push(merge({}, { label: "", [componentType]: (defaultInputValues as any)[componentType] }, existingValue))
                })
                return toReturn
            }
        })

        // apply default to outputs
        utils.replaceValueForKey(this.#streamConfig, {
            "inputs": (existingValues: TOutput[]) => {
                let toReturn: TOutput[] = []
                existingValues.forEach(existingValue => {
                    let componentType = Object.keys(existingValue).filter(x => x !== "label")[0] // eg. generate
                    toReturn.push(merge({}, { label: "", [componentType]: (defaultOutputValues as any)[componentType] }, existingValue))
                })
                return toReturn
            }
        })

        // // apply defaults to input
        // Object.keys(this.#streamConfig.input).filter(ipo => ipo !== "label").forEach(ipo => {   // ipo=input, processor or output
        //     Object.keys((defaultInputValues as any)[ipo]).forEach(k => {
        //         if (!Object.keys((this.#streamConfig.input as any)[ipo]).includes(k)) {
        //             // if a key e.g. codec isnt found then 'assign'
        //             (this.#streamConfig.input as any)[ipo][k] = (defaultInputValues as any)[ipo][k]
        //         }
        //     })
        // })

        // apply defaults to output
        // Object.keys(this.#streamConfig.output).filter(ipo => ipo !== "label").forEach(ipo => {
        //     Object.keys((defaultOutputValues as any)[ipo]).forEach(k => {
        //         if (!Object.keys((this.#streamConfig.output as any)[ipo]).includes(k)) {
        //             // if a key e.g. codec isnt found then 'assign'
        //             (this.#streamConfig.output as any)[ipo][k] = (defaultOutputValues as any)[ipo][k]
        //         }
        //     })
        // })

        // // apply defaults to input.processors
        // this.#streamConfig.input?.processors?.forEach(processor => Object.keys(processor).filter(ipo => ipo !== "label").forEach(ipo => {
        //     Object.keys((defaultProcessorValues as any)[ipo]).forEach(k => {
        //         if (!Object.keys((processor as any)[ipo]).includes(k)) {
        //             // if a key e.g. codec isnt found then 'assign'
        //             (processor as any)[ipo][k] = (defaultProcessorValues as any)[ipo][k]
        //         }
        //     })
        // }))
        // // apply defaults to pipeline.processors
        // this.#streamConfig.pipeline?.processors.forEach(processor => Object.keys(processor).filter(ipo => ipo !== "label").forEach(ipo => {
        //     Object.keys((defaultProcessorValues as any)[ipo]).forEach(k => {
        //         if (!Object.keys((processor as any)[ipo]).includes(k)) {
        //             // if a key e.g. codec isnt found then 'assign'
        //             (processor as any)[ipo][k] = (defaultProcessorValues as any)[ipo][k]
        //         }
        //     })
        // }))
        // // apply defaults to output.processors
        // this.#streamConfig.output?.processors?.forEach(processor => Object.keys(processor).filter(ipo => ipo !== "label").forEach(ipo => {
        //     Object.keys((defaultProcessorValues as any)[ipo]).forEach(k => {
        //         if (!Object.keys((processor as any)[ipo]).includes(k)) {
        //             // if a key e.g. codec isnt found then 'assign'
        //             (processor as any)[ipo][k] = (defaultProcessorValues as any)[ipo][k]
        //         }
        //     })
        // }))

        try {
            fs.writeFileSync(this.#streamConfigFilePath, JSON.stringify(this.#streamConfig))
        } catch (err) {
            throw new Error(`failed to write config into tmp: ${JSON.stringify(err, Object.getOwnPropertyNames(err))}`)
        }
    }
}

export { Stream }

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
//     output: { stdout: {} }
// })