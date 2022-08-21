import { execaCommandSync } from "execa"
import axios from 'axios';

function checkExeExists(): boolean {
    try {
        execaCommandSync(`benthos -v`)
    } catch (err: any) {
        if (err.exitCode !== 0) return false
    }
    return true
}

function standardizeAxiosErrors(e: any): Error {
    if (axios.isAxiosError(e)) {
        if (e.response) {
            return new Error(e.message)
            // not sending all the information. should we?
            // return new Error(JSON.stringify({ status: e.response.status, headers: e.response.headers, data: e.response.data }))
        } else if (e.request) {
            return new Error(e.message)
            // not sending all the information. should we?
            // return new Error(JSON.stringify(e.toJSON()))
        }
    }
    return e
}

async function sleep(ms: number): Promise<boolean> {
    let resolve: (value: unknown) => void
    let p = new Promise(r => { resolve = r })
    setTimeout(resolve!, ms);
    await p
    return true
}

class Deferred {
    public promise: Promise<unknown>
    public reject!: (reason?: any) => void
    public resolve!: (value?: any) => void
    public fulfilled: boolean = false
    public rejected: boolean = false
    public resolved: boolean = false

    constructor() {
        let self = this
        this.promise = new Promise(function (resolve, reject) {
            self.reject = (reason?: any) => {
                self.fulfilled = true
                self.rejected = true
                reject(reason)
            }
            self.resolve = (value?: any) => {
                self.fulfilled = true
                self.resolved = true
                resolve(value)
            }
        })
    }
}

/**
 * iterates through the entire object to replace oldKey with newKey
 * CAUTION: it mutates the object itself
 * @param obj 
 * @param keyMap 
 * @returns 
 */
function replaceKeys(obj: any, keyMap: { [oldKey: string]: () => string }) {
    let iterate = (obj: any) => {
        Object.keys(obj).forEach(key => {
            if (Object.keys(keyMap).includes(key)) {
                let oldKey = key
                let newKey = keyMap[oldKey]
                Object.defineProperty(obj, newKey(), Object.getOwnPropertyDescriptor(obj, oldKey)!);
                delete (obj as any)[oldKey];
                return obj
            } else {
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    iterate(obj[key])
                } else if (Array.isArray(obj[key])) {
                    obj[key].forEach((el: any) => {
                        iterate(el)
                    })
                }
            }
        })
    }
    iterate(obj)
    return obj
}

export { checkExeExists, standardizeAxiosErrors, sleep, Deferred, replaceKeys }