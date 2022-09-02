import * as exthos from "../../dist/index.js";

let engine = new exthos.Engine({})
engine.useDefaultEventHandler()

engine.start()

setTimeout(() => {
    engine.stop()
}, 3000);