import { Engine } from "../engine/engine.js";
import { Stream } from "../stream/stream.js";
import { TInput, TInputBroker } from "../types/inputs.js";
import { TOutput, TOutputBroker } from "../types/outputs.js";
import { TProcessor } from "../types/processors.js";
import { TStreamConfig } from "../types/streamConfig.js";
import { proxyPromise } from "../utils/utils.js";

type Batching = Omit<
  Required<TInputBroker["broker"]>["batching"],
  "processors"
>;
type RouteProxymisedMethods<A extends any[], T extends keyof Route> = (
  ...a: A
) => Pick<Route, T> & {
  then: (value: (rt: Pick<Route, T>) => void) => {
    catch: (value: (e: Error) => void) => {
      finally: (value: () => void) => void;
    };
  } & { finally: (value: () => void) => void };
  catch: (value: (e: Error) => void) => {
    finally: (value: () => void) => void;
  };
};

let from = proxyPromise(async function (
  engine: Engine,
  ...inputs: [TInput, ...TInput[]]
) {
  let r = new Route(engine, ...inputs);

  return r as Pick<Route, "to" | "batchInput" | "_via">;
  // return {
  //     batch: r.batchAtInput.bind(r),
  //     //via: TODO
  //     to: r.to.bind(r)
  // }
});

class Route {
  #inputBroker: TInputBroker = {
    broker: {
      inputs: [],
    },
  };
  #outputBroker: TOutputBroker = {
    broker: {
      outputs: [],
    },
  };
  #engine: Engine;
  #stream!: Stream;
  #processors: TProcessor[] = [];

  constructor(engine: Engine, ...inputs: [TInput, ...TInput[]]) {
    this.#engine = engine;
    this.#inputBroker.broker.inputs = inputs;
  }

  // batching can happen only once
  batchInput = proxyPromise(async function (this: Route, batching: Batching) {
    let self = this;
    self.#inputBroker.broker.batching = {
      ...self.#inputBroker.broker.batching,
      ...batching,
    };
    // return {
    //     //via: TODO
    //     batch: self.batchAtOutput.bind(self),
    //     to: self.to.bind(self),
    // }
    return self as Pick<Route, "to" | "batchOutput" | "_via">;
  });

  batchOutput = proxyPromise(async function (this: Route, batching: Batching) {
    let self = this;
    self.#outputBroker.broker.batching = {
      ...self.#outputBroker.broker.batching,
      ...batching,
    };
    // return {
    //     to: self.to.bind(self)
    // }
    return self as Pick<Route, "to">;
  });

  to: RouteProxymisedMethods<
    [TOutput, ...TOutput[]],
    "start" | "startAfter" | "stop" | "stopAfter"
  > = proxyPromise(async function (
    this: Route,
    ...outputs: [TOutput, ...TOutput[]]
  ) {
    let self = this;
    self.#outputBroker.broker.outputs = outputs;
    // return {
    //     start: self.start.bind(self),
    //     stop: self.stop.bind(self),
    //     stopAfter: self.stopAfter.bind(self)
    // }
    return self as Pick<Route, "start" | "startAfter" | "stop" | "stopAfter">;
  });

  _via: RouteProxymisedMethods<
    [TProcessor, ...TProcessor[]],
    "to" | "batchOutput" | "_via"
  > = proxyPromise(async function (
    this: Route,
    ...processors: [TProcessor, ...TProcessor[]]
  ) {
    let self = this;
    self.#processors.push(...processors);
    return self as Pick<Route, "to" | "batchOutput" | "_via">;
  });

  // start: () => Pick<Route, "stop" | "stopAfter"> & {
  //     then: (value: (rt: Pick<Route, "stop" | "stopAfter">) => void) => { catch: (value: (e: Error) => void) => { finally: (value: () => void) => void } }
  //         & { finally: (value: () => void) => void }
  //     ,
  //     catch: (value: (e: Error) => void) => { finally: (value: () => void) => void }
  // }

  start: RouteProxymisedMethods<[], "stop" | "stopAfter"> = proxyPromise(
    async function (this: Route) {
      // add the stream to the engine
      let self = this;
      self.#stream = self.#stream || new Stream(self.#toStreamConfig());
      await self.#engine.start();
      await self.#engine.add(self.#stream);

      return self as Pick<Route, "stop" | "stopAfter">;
    }
  );

  startAfter: RouteProxymisedMethods<[number], "stop" | "stopAfter"> =
    proxyPromise(async function (this: Route, ms: number) {
      let self = this;
      await new Promise((r: any) => {
        setTimeout(r, ms);
      });
      self.#stream = self.#stream || new Stream(self.#toStreamConfig());
      await self.#engine.start();
      await self.#engine.add(self.#stream);
      return self as Pick<Route, "stop" | "stopAfter">;
    });

  stop: RouteProxymisedMethods<[], "start" | "startAfter"> = proxyPromise(
    async function (this: Route) {
      let self = this;
      await self.#engine.remove.bind(self.#engine)(self.#stream);
      return self as Pick<Route, "start" | "startAfter">;
    }
  );

  stopAfter: RouteProxymisedMethods<[number], "start" | "startAfter"> =
    proxyPromise(async function (this: Route, ms: number) {
      let self = this;
      await new Promise((r: any) => {
        setTimeout(r, ms);
      });
      await self.stop();
      return self as Pick<Route, "start" | "startAfter">;
    });

  #toStreamConfig(): TStreamConfig {
    let self = this;
    return {
      input: self.#inputBroker,
      pipeline: {
        processors: self.#processors,
      },
      output: self.#outputBroker,
    };
  }
}

export { from, Route };
