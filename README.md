# What is exthos
`exthos` helps create and manage stream processing pipelines that run on underlying `golang` module.
`exthos` is about executing `benthos` the javascript way. Yes, benthos is that underlying goland module.

# How exthos works
At the core of exthos is the `engine` that is responsible for running the `engineProcess`. The `engineProcess` is esentially a child process that runs `benthos` (in streams mode). Streams are created, not using yaml or json, but JS classes, leveraging the typed system of typescript. These streams can then be added, updated or removed from the engine at will.

The engine produces a lot of events (eventEmitter2) that can be listened to for specific actions. e.g. to notify your Operations team when an error occurs in one of the streams using `engine.stream.error` event. Read more about events in the below sections.

# What is different to benthos
In terms of the components, exthos introduces the following components on top of all existing benthos components:
- inPort: is an input type that can be used to send data from JS-land to benthos
- outPort: is an output type that can be used to receive data from benthos to JS-land
- javascript: is a processor type that can be used to manipulate content and meta
- direct: is an alias for inProc and is used to move events between 

# Usage
A good starting point is to read the notes below and then head to the `examples` folders.

## Using high level APIs: from/via/to

Basic example
```js
import { from, engine, defaultEngineEventHandler } from "exthos"

from({ generate: { mapping: 'root = count("gen")' } }).to({ stdout: {} }).start().stopAfter("5s")
```

More advanced example
```js
import { from, engine, defaultEngineEventHandler } from "exthos"

engine.onAny(defaultEngineEventHandler)
engine.setEngineOptions({logger:{level: "ALL", format: "json"}})

let route = from({ generate: { mapping: 'root = count("gen")' } }).batchAtInput({ count: 2 }).to({ stdout: {} })
route.start()

setTimeout(() => {
    route.stop()
}, 8000);
```

## Using the low level APIs: Engine and Stream
The flow of code is in the following manner:
- Create a stream
- Start the stream as a standalone process for a quick feel, integration testing, debugging or other adhoc needs
- Create an engine
    - Engine can either be local or remote
    - Only a single instance of the running engine is supported
- Add stream to the engine
- Start the engine
- Modify a stream anytime using `stream.streamConfig
- Stop the engine

```js

```

## Other considerations beyond local development
### logging
exthos makes use of the fabulous debug module. The namespaces that can be configured with `DEBUG=` are:
```
    - exthos*
    - exthos:engine:*
    - exthos:engine:debug
    - exthos:engineProcess:*
    - exthos:engineProcess:trace
    - exthos:engineProcess:debug
    - exthos:engineProcess:..........all the way to fatal
```

The engine DEBUG output relays the logs from the node process itself

The engineProcess DEBUG output relay the logs output from benthos

- error handling

### events

Multiple events are generated for the `engine` and for each `stream`. We use the fantastic EventEmitter2 package for emitting events (ddi you know you can use wildcards and any for listening to multiple events!).

Each event emits the `eventObj` that takes the form of `{ stream?: Stream, msg: string }` i.e. it always contains the `msg` string value and may contain the `stream` object if the event was generated in the context of a stream

### metrics
A WIP
