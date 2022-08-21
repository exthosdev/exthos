import * as ll from "./utils/log_level.js"; ll;   // must be the first thing, so LOG_LEVEL can be ised instead of DEBUG
import 'dotenv/config'
import { Stream } from "./stream/stream.js";
import { Engine } from "./engine/engine.js";
import { defaultEngineEventHandler as DEEH } from "./engine/defaultEngineEventHandler.js"
// import { defaultEngineEventHandler } from "./engine/defaultEngineEventHandler.js"
import { engine, from } from "./hlapis/index.js"

// let defaultEngineEventHandler = (eventName: string, eventObj: { stream: Stream }) => { DEEH(engine, eventName, eventObj) }
let defaultEngineEventHandler = DEEH.bind(engine)
const exthos = {
    engine,
    from,
    defaultEngineEventHandler
}

export { Stream, Engine, engine, from, defaultEngineEventHandler }
export default exthos;