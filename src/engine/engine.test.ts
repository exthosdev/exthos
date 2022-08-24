import EventEmitter2 from "eventemitter2";
import { Stream } from "../stream/stream.js";
// import { defaultEngineEventHandler } from "./defaultEngineEventHandler.js";
import { Engine } from "./engine.js";

describe("engine start stop", () => {

    let engine = new Engine()
    engine.onAny((eventName: string | string[], eventObj: {stream: Stream}) => {
        if (eventName === "engine.fatal") {
            throw new Error((eventObj as any)["msg"] || "engine.fatal occured, but msg was absent in the eventObj.msg");
            
        }
    })
    engine.setEngineOptions({ logger: { level: "NONE", format: "json", } })

    test("start and stop engine when benthos exe exists", async () => {
        expect.assertions(2)
        await expect(engine.start()).resolves.not.toThrow()
        await expect(engine.stop()).resolves.not.toThrow()
    })

    test("stop engine that hasnt started", async () => {
        expect.assertions(1)
        await expect(engine.stop()).resolves.not.toThrow()
    })

    test("start engine that stops itself after 10s", async () => {
        expect.assertions(2)
        await expect(engine.start()).resolves.not.toThrow()
        let eventObj = (await EventEmitter2.once(engine, engine.engineEvents["engine.inactive"]))[0]
        expect(eventObj).toHaveProperty(["msg"], "stopped successfully. reason:no streams for the last 10000ms")
    }, 11000)
})