import { execaCommand, ExecaChildProcess } from 'execa';
import { defaultInputValues } from "../defaults/defaultInputValues.js";
import { defaultOutputValues } from "../defaults/defaultOutputValues.js";
import * as path from "path";
import { tmpdir } from "os";
import * as fs from "fs";
import { randomUUID } from 'crypto';
import * as internal from 'stream';
import * as utils from '../utils/utils.js';
import { defaultProcessorValues } from '../defaults/defaultProcessorValues.js';
import debug from "debug";
import { TStreamConfig } from '../types/streamConfig.js';

class Stream {
    readonly #streamConfigFilePath: string = path.join(tmpdir(), "exthos_stream_conf_" + randomUUID() + ".json")
    #streamConfig: TStreamConfig
    #childProcess!: ExecaChildProcess<string>
    #abortController = new AbortController();
    #hasInPort: boolean = false
    #hasOutPort: boolean = false
    // #logger = {     // TODO: get rid of logger
    //     "trace": debug("trace:Engine"),
    //     "debug": debug("debug:Engine"),
    //     "info": debug("info:Engine"),
    //     "error": debug("error:Engine")
    // }
    #debug = debug("exthos").extend("stream:debug")
    #status: "stopped" | "started" = "stopped"
    #inPort!: internal.Writable
    #outPort!: internal.Readable

    public readonly streamID: string = randomUUID()
    // public active uptime uptime_str TODO. these should be part of the stream

    get streamConfig(): TStreamConfig {
        return this.#streamConfig
    }
    set streamConfig(s: TStreamConfig) {
        this.#streamConfig = s
        this._sanitizeStreamConfigNWriteToStreamConfigFilePath()
    }

    get inPort(): internal.Writable {
        return this.#inPort
    }

    get outPort(): internal.Readable {
        return this.#outPort
    }

    constructor(streamConfig: TStreamConfig, autostart?: boolean) {
        this.#streamConfig = streamConfig

        if (autostart === undefined) {
            autostart = false
        }

        this.#debug("received streamConfig:\n", JSON.stringify(this.#streamConfig, null, 2))
        this._sanitizeStreamConfigNWriteToStreamConfigFilePath()
        this.#debug("sanitized streamConfig:\n", JSON.stringify(this.#streamConfig, null, 2))

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
                this.#childProcess = execaCommand(`benthos -s logger.format=json -s logger.static_fields.@service=exthos -s http.enabled=false -c ${this.#streamConfigFilePath}`, { signal: this.#abortController.signal });

                this.#childProcess.on("spawn", () => {
                    this.#debug("stream started successfuly")
                    this.#status = "started"
                })

                process.stdin.pipe(this.#childProcess.stdin!)
                this.#childProcess.stdout?.pipe(process.stdout)
                this.#childProcess.stderr?.pipe(process.stderr)

                // TODO: move the below to _sanitizeStreamConfigNWriteToStreamConfigFilePath so engine can also use in/outPorts
                if (this.#hasOutPort) {
                    this.#outPort = this.#childProcess.stdout!
                }

                if (this.#hasInPort) {
                    this.#inPort = this.#childProcess.stdin!
                }

                await this.#childProcess

                this.#status = "stopped"
                this.#debug("stream stopped (completed) successfully")
            }
        } catch (err: any) {
            this.#status = "stopped"

            if (err.killed && err.isCanceled) {
                this.#debug("stream (force) stopped successfully")      // abort was used
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
            this.#status = "stopped"
        }
    }

    private _sanitizeStreamConfigNWriteToStreamConfigFilePath() {
        let self = this
        // TODO the same for input and output processors

        // replace TJavascript with TSubprocess in pipeline.processors
        this.#streamConfig.pipeline?.processors.forEach((processor, processorIdx) => Object.keys(processor).filter(ipo => ipo !== "label").forEach(ipo => {
            if (ipo === "javascript") {
                let jsFile = path.join(tmpdir(), "jsFile_" + randomUUID() + ".js");
                self.#debug("writing javascript to file:", jsFile);

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

        // covert inport to stdin and allow write and end
        // convert outport into stdout and allow read
        // covert direct to inproc
        utils.replaceKeys(this.#streamConfig, {
            "inport": () => { self.#hasInPort = true; return "stdin" },
            "outport": () => { self.#hasOutPort = true; return "stdout" },
            "direct": () => { return "inproc" }
        })

        // // covert inport to stdin and allow write and end
        // if (Object.keys(this.#streamConfig.input).includes("inport")) {
        //     let o = this.#streamConfig.input
        //     let old_key = "inport"
        //     let new_key = "stdin"
        //     Object.defineProperty(o, new_key, Object.getOwnPropertyDescriptor(o, old_key)!);
        //     delete (o as any)[old_key];

        //     // mark the instance to allow .write and .end method
        //     this.#hasInPort = true
        // }

        // // convert outport into stdout and allow read
        // if (Object.keys(this.#streamConfig.output).includes("outport")) {
        //     let o = this.#streamConfig.output
        //     let old_key = "outport"
        //     let new_key = "stdout"
        //     Object.defineProperty(o, new_key, Object.getOwnPropertyDescriptor(o, old_key)!);
        //     delete (o as any)[old_key];

        //     // mark the instance to allow .write and .end method
        //     this.#hasOutPort = true
        // }

        // // covert direct to inproc for input
        // if (Object.keys(this.#streamConfig.input).includes("direct")) {
        //     let o = this.#streamConfig.input
        //     let old_key = "direct"
        //     let new_key = "inproc"
        //     Object.defineProperty(o, new_key, Object.getOwnPropertyDescriptor(o, old_key)!);
        //     delete (o as any)[old_key];
        // }
        // //convert direct to inproc for output
        // if (Object.keys(this.#streamConfig.output).includes("direct")) {
        //     let o = this.#streamConfig.output
        //     let old_key = "direct"
        //     let new_key = "inproc"
        //     Object.defineProperty(o, new_key, Object.getOwnPropertyDescriptor(o, old_key)!);
        //     delete (o as any)[old_key];
        // }

        // apply defaults to input
        Object.keys(this.#streamConfig.input).filter(ipo => ipo !== "label").forEach(ipo => {   // ipo=input, processor or output
            Object.keys((defaultInputValues as any)[ipo]).forEach(k => {
                if (!Object.keys((this.#streamConfig.input as any)[ipo]).includes(k)) {
                    // if a key e.g. codec isnt found then 'assign'
                    (this.#streamConfig.input as any)[ipo][k] = (defaultInputValues as any)[ipo][k]
                }
            })
        })

        // apply defaults to output
        Object.keys(this.#streamConfig.output).filter(ipo => ipo !== "label").forEach(ipo => {
            Object.keys((defaultOutputValues as any)[ipo]).forEach(k => {
                if (!Object.keys((this.#streamConfig.output as any)[ipo]).includes(k)) {
                    // if a key e.g. codec isnt found then 'assign'
                    (this.#streamConfig.output as any)[ipo][k] = (defaultOutputValues as any)[ipo][k]
                }
            })
        })

        // apply defaults to input.processors
        this.#streamConfig.input?.processors?.forEach(processor => Object.keys(processor).filter(ipo => ipo !== "label").forEach(ipo => {
            Object.keys((defaultProcessorValues as any)[ipo]).forEach(k => {
                if (!Object.keys((processor as any)[ipo]).includes(k)) {
                    // if a key e.g. codec isnt found then 'assign'
                    (processor as any)[ipo][k] = (defaultProcessorValues as any)[ipo][k]
                }
            })
        }))
        // apply defaults to pipeline.processors
        this.#streamConfig.pipeline?.processors.forEach(processor => Object.keys(processor).filter(ipo => ipo !== "label").forEach(ipo => {
            Object.keys((defaultProcessorValues as any)[ipo]).forEach(k => {
                if (!Object.keys((processor as any)[ipo]).includes(k)) {
                    // if a key e.g. codec isnt found then 'assign'
                    (processor as any)[ipo][k] = (defaultProcessorValues as any)[ipo][k]
                }
            })
        }))
        // apply defaults to output.processors
        this.#streamConfig.output?.processors?.forEach(processor => Object.keys(processor).filter(ipo => ipo !== "label").forEach(ipo => {
            Object.keys((defaultProcessorValues as any)[ipo]).forEach(k => {
                if (!Object.keys((processor as any)[ipo]).includes(k)) {
                    // if a key e.g. codec isnt found then 'assign'
                    (processor as any)[ipo][k] = (defaultProcessorValues as any)[ipo][k]
                }
            })
        }))

        // this._streamConfigFilePath = path.join(tmpdir(), "exthos_stream_conf_" + randomUUID() + ".json")
        try {
            fs.writeFileSync(this.#streamConfigFilePath, JSON.stringify(this.#streamConfig))
        } catch (err) {
            throw new Error(`failed to write config into tmp: ${JSON.stringify(err, Object.getOwnPropertyNames(err))}`)
        }
    }

    // public toJSON(): { streamID: string } {
    //     return {
    //         streamID: this.streamID
    //     }
    // }
}

export { Stream }