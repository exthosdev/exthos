let streamErrorCounter = {} // streamID to count

function defaultEngineEventHandler(eventName, eventObj) {
    let self = this
    if (eventName === "engine.stream.error") {
        console.log(`           ${eventName}>>${JSON.stringify(eventObj)}`);
        streamErrorCounter[eventObj.stream.steamID] = streamErrorCounter[eventObj.stream.steamID] || 0
        streamErrorCounter[eventObj.stream.steamID] = streamErrorCounter[eventObj.stream.steamID] + 1
        if (streamErrorCounter[eventObj.stream.steamID] === 5) {
            // remove the stream if error received 5 times
            self.remove(eventObj.stream)
        }
    } else {
        console.log(`           ${eventName}>>${JSON.stringify(eventObj)}`);
    }
}

export default defaultEngineEventHandler;