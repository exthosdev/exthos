// LOG_LEVEL alias for DEBUG env var

import debug from "debug"

// defaults to DEBUG if present or LOG_LEVEL if present or info*
process.env.DEBUG = process.env.DEBUG ? process.env.DEBUG : process.env.LOG_LEVEL ? process.env.LOG_LEVEL : "info*"

class Logger {
    private _debugNamespace: any

    // {
    //     "trace": debug("trace").extend("Engine"),
    //     "debug": debug("debug").extend("Engine"),
    //     "info": debug("info").extend("Engine"),
    //     "warn": debug("warn").extend("Engine"),
    //     "error": debug("error").extend("Engine"),
    //     "fatal": (f: any, ...a: any[]) => {
    //         let self = this
    //         debug("fatal").extend("Engine")(f, ...(a as []))
    //         self.stop()
    //     }
    // }

    constructor(namespacePrefixes: string[] | string) {
        if (Array.isArray(namespacePrefixes)) {
            namespacePrefixes = namespacePrefixes.join(",")
        }
        this._debugNamespace = debug.disable()
        this._debugNamespace = [
            this._debugNamespace,
            /^warn/i.test(this._debugNamespace) ? this._debugNamespace.replace(/warn/, "error") : undefined,
            /^info/i.test(this._debugNamespace) ? this._debugNamespace.replace(/info/, "error") : undefined,
            /^info/i.test(this._debugNamespace) ? this._debugNamespace.replace(/info/, "warn") : undefined,
            /^debug/i.test(this._debugNamespace) ? this._debugNamespace.replace(/debug/, "error") : undefined,
            /^debug/i.test(this._debugNamespace) ? this._debugNamespace.replace(/debug/, "warn") : undefined,
            /^debug/i.test(this._debugNamespace) ? this._debugNamespace.replace(/debug/, "info") : undefined,
            /^trace/i.test(this._debugNamespace) ? this._debugNamespace.replace(/trace/, "error") : undefined,
            /^trace/i.test(this._debugNamespace) ? this._debugNamespace.replace(/trace/, "warn") : undefined,
            /^trace/i.test(this._debugNamespace) ? this._debugNamespace.replace(/trace/, "info") : undefined,
            /^trace/i.test(this._debugNamespace) ? this._debugNamespace.replace(/trace/, "debug") : undefined,
        ].map(dn => { 
            if (namespacePrefixes) return namespacePrefixes + ":" + dn 
            else return dn
        }).join(",")
        debug.enable(this._debugNamespace)
    }
}
export { Logger }