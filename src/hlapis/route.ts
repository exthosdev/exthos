import { Engine } from "../engine/engine.js"
import { Stream } from "../stream/stream.js"
import { TInput, TInputBroker } from "../types/inputs.js"
import { TOutput, TOutputBroker } from "../types/outputs.js"
import { TStreamConfig } from "../types/streamConfig.js"
import { proxyPromise } from "../utils/utils.js"

type Batching = Omit<Required<TInputBroker["broker"]>["batching"], "processors">

let from = proxyPromise(async function (engine: Engine, ...inputs: [TInput, ...TInput[]]) {
    let r = new Route(engine, ...inputs)

    return r as Pick<Route, "to" | "batchInput">
    // return {
    //     batch: r.batchAtInput.bind(r),
    //     //via: TODO
    //     to: r.to.bind(r)
    // }
})

class Route {
    #inputBroker: TInputBroker = {
        broker: {
            inputs: []
        }
    }
    #outputBroker: TOutputBroker = {
        broker: {
            outputs: []
        }
    }
    #engine: Engine
    #stream!: Stream

    constructor(engine: Engine, ...inputs: [TInput, ...TInput[]]) {
        this.#engine = engine
        this.#inputBroker.broker.inputs = inputs
    }

    // batching can happen only once
    batchInput = proxyPromise(async function (this: Route, batching: Batching) {
        let self = this
        self.#inputBroker.broker.batching = { ...self.#inputBroker.broker.batching, ...batching }
        // return {
        //     //via: TODO
        //     batch: self.batchAtOutput.bind(self),
        //     to: self.to.bind(self),
        // }
        return self as Pick<Route, "to" | "batchOutput">
    })

    batchOutput = proxyPromise(async function (this: Route, batching: Batching) {
        let self = this
        self.#outputBroker.broker.batching = { ...self.#outputBroker.broker.batching, ...batching }
        // return {
        //     to: self.to.bind(self)
        // }
        return self as Pick<Route, "to">
    })

    to = proxyPromise(async function (this: Route, ...outputs: [TOutput, ...TOutput[]]) {
        let self = this
        self.#outputBroker.broker.outputs = outputs
        // return {
        //     start: self.start.bind(self),
        //     stop: self.stop.bind(self),
        //     stopAfter: self.stopAfter.bind(self)
        // }
        return self as Pick<Route, "start" | "stop" | "stopAfter">
    })

    // start: () => Pick<Route, "stop" | "stopAfter"> = proxyPromise(async function (this: Route) {

    start: () => Pick<Route, "stop" | "stopAfter"> & {
        then: (value: (rt: Pick<Route, "stop" | "stopAfter">) => void) => { catch: (value: (e: Error) => void) => { finally: (value: () => void) => void } }
            & { finally: (value: () => void) => void }
        ,
        catch: (value: (e: Error) => void) => { finally: (value: () => void) => void }
    } = proxyPromise(async function (this: Route) {
        // add the stream to the engine
        let self = this
        self.#stream = self.#stream || new Stream(self.#toStreamConfig())
        await self.#engine.start()
        await self.#engine.add(self.#stream)

        // return {
        //     stop: self.stop.bind(self),
        //     stopAfter: self.stopAfter.bind(self)
        // }
        return self as Pick<Route, "stop" | "stopAfter">
    })

    startAfter = proxyPromise(async function (this: Route, ms: number) {
        let self = this
        await new Promise((r: any) => { setTimeout(r, ms); })
        self.#stream = self.#stream || new Stream(self.#toStreamConfig())
        await self.#engine.start()
        await self.#engine.add(self.#stream)
        return self as Pick<Route, "stop" | "stopAfter">
    })

    stop = proxyPromise(async function (this: Route) {
        let self = this
        await self.#engine.remove.bind(self.#engine)(self.#stream)
        return self as Pick<Route, "start">
    })

    stopAfter = proxyPromise(async function (this: Route, ms: number) {
        let self = this
        await new Promise((r: any) => { setTimeout(r, ms); })
        await self.stop() // .bind(self)
        return self as Pick<Route, "start">
    })

    #toStreamConfig(): TStreamConfig {
        let self = this
        return {
            input: self.#inputBroker,
            // pipeline: {
            //     processors: self.via.processors
            // },
            output: self.#outputBroker
        }
    }
}

export { from, Route }