import { Engine } from "../engine/engine.js"
import { Stream } from "../stream/stream.js"
import { TInput, TInputBroker } from "../types/inputs.js"
import { TOutput, TOutputBroker } from "../types/outputs.js"
import { TStreamConfig } from "../types/streamConfig.js"

type Batching = Omit<Required<TInputBroker["broker"]>["batching"], "processors">

function from(engine: Engine, ...inputs: [TInput, ...TInput[]]) {
    let r = new Route(engine, ...inputs)
    return {
        batchAtInput: r.batchAtInput.bind(r),
        //via: TODO
        to: r.to.bind(r)
    }
}

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

    #stopNReturnRoute(): Route {
        let self = this
        self.#engine.remove.bind(self.#engine)(self.#stream)
        return self
    }

    constructor(engine: Engine, ...inputs: [TInput, ...TInput[]]) {
        this.#engine = engine
        // this.#inputBroker = {
        //     broker: {
        //         inputs: inputs,
        //         batching: {}
        //     }
        // }
        this.#inputBroker.broker.inputs = inputs
    }

    // batching can happen only once    
    batchAtInput(batching: Batching) {
        let self = this
        self.#inputBroker.broker.batching = { ...self.#inputBroker.broker.batching, ...batching }
        return {
            //via: TODO
            batchAtOutput: self.batchAtOutput.bind(self),
            to: self.to.bind(self),
        }
    }

    // TODO:
    batchAtOutput(batching: Batching) {
        let self = this
        self.#outputBroker.broker.batching = { ...self.#outputBroker.broker.batching, ...batching }
        return {
            to: self.to.bind(self)
        }
    }

    to(...outputs: [TOutput, ...TOutput[]]) {
        let self = this
        // self.#outputBroker = {
        //     broker: {
        //         outputs: outputs,
        //         // ...options
        //     }
        // }
        self.#outputBroker.broker.outputs = outputs
        return {
            start: self.start.bind(self),
            stop: self.#stopNReturnRoute.bind(self)
        }
    }

    start(): { stop: () => Route } {
        // add the stream to the engine
        let self = this
        self.#stream = new Stream(self.#toStreamConfig())
        self.#engine.start().then(_ => {
            self.#engine.add(self.#stream)
        })
        
        return {
            // stop: self.#engine.remove.bind(self.#engine)
            stop: self.#stopNReturnRoute.bind(self)
        }
    }

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