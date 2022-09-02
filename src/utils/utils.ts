import { execaCommandSync } from "execa"
import axios from 'axios';
import proxymise from "./proxymise.js";

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
                if (!(typeof obj[key] === 'object' && obj[key] !== null)) {
                    // reutrn if not an object, otherwise need to recurse
                    return obj
                }
            } //else {
            if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                iterate(obj[key])
            } else if (Array.isArray(obj[key])) {
                obj[key].forEach((el: any) => {
                    iterate(el)
                })
            }
            //}
        })
    }
    iterate(obj)
    return obj
}

/**
  * iterates through the entire object to remove existing values and replace values provided in the kv object
 * CAUTION: it mutates the object itself
 * CAUTION: completely removes existing value for the given k
 * @param obj 
 * @param kv 
 * @returns 
 */
function replaceValueForKey<O, T>(obj: O, kv: { [forKey: string]: (existingValue: T) => T }) {
    let iterate = (obj: any) => {
        Object.keys(obj).forEach(key => {
            if (Object.keys(kv).includes(key)) {
                obj[key] = kv[key](obj[key])    // assign the value, usually merged value will be provided by kv[forKey] func
                if (!(typeof obj[key] === 'object' && obj[key] !== null)) {
                    // return only if not an object, so that nested properties with same forKey are also taken care of
                    return obj
                }
            }
            if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                // if an object, then recurse
                iterate(obj[key])
            } else if (Array.isArray(obj[key])) {
                // if an array, then recurse for each element
                obj[key].forEach((el: any) => {
                    iterate(el)
                })
            }
        })
    }
    iterate(obj)
    return obj
}

/**
 * use proxymise to build fluent proxies for promises
 */
function proxyPromise<T extends (...args: any) => any>(t: T) {
    return proxymise(t) as ((...params: Parameters<T>) => Awaited<ReturnType<T>> &
    {
        then: (value: (rt: Awaited<ReturnType<T>>) => void) => { catch: (value: (e: Error) => void) => { finally: (value: () => void) => void } } & { finally: (value: () => void) => void },
        catch: (value: (e: Error) => void) => { finally: (value: () => void) => void },
    })
}

function getISOStringLocalTz(date: Date = new Date()) {
    var tzo = -date.getTimezoneOffset(),
        dif = tzo >= 0 ? '+' : '-',
        pad = function (num: number) {
            return (num < 10 ? '0' : '') + num;
        };

    return date.getFullYear() +
        '-' + pad(date.getMonth() + 1) +
        '-' + pad(date.getDate()) +
        'T' + pad(date.getHours()) +
        ':' + pad(date.getMinutes()) +
        ':' + pad(date.getSeconds()) +
        dif + pad(Math.floor(Math.abs(tzo) / 60)) +
        ':' + pad(Math.abs(tzo) % 60);

}

function getCaller() {
    return ((new Error().stack as any).split("at ")[3]).trim()
}

function formatErrorForEvent(e: any) {
    // return `${e.code ? e.code + " ": ""} ${e.message ? e.message : ""}`
    let toReturn = {}
    Object.getOwnPropertyNames(e).forEach(p => {
        (toReturn as any)[p] = e[p]
    })
    return toReturn
}

export { checkExeExists, standardizeAxiosErrors, sleep, Deferred, replaceKeys, replaceValueForKey, proxyPromise, getISOStringLocalTz, getCaller, formatErrorForEvent }