# exthos

![logo](https://raw.githubusercontent.com/exthosdev/exthos/main/docs/media/logo_exthos.gif)

> stream processing in NodeJS using the power of Golang

## Website

[exthos](https://exthosdev.github.io/exthos/)

## Table of Contents

- [exthos](#exthos)
  - [Website](#website)
  - [Table of Contents](#table-of-contents)
- [Theory](#theory)
  - [Motivation](#motivation)
  - [How exthos works](#how-exthos-works)
  - [How to use exthos](#how-to-use-exthos)
    - [Overview: Low level APIs](#overview-low-level-apis)
    - [Overview: High level APIs](#overview-high-level-apis)
  - [Components](#components)
    - [Inputs](#inputs)
    - [Outputs](#outputs)
    - [Processors](#processors)
    - [Messages](#messages)
- [In practice](#in-practice)
  - [Installation](#installation)
  - [Usage](#usage)
  - [Using high level APIs: from/via/to](#using-high-level-apis-fromviato)
  - [Other/non-functional features](#othernon-functional-features)
    - [Labels](#labels)
    - [Error handling](#error-handling)
    - [Logging](#logging)
    - [Events](#events)
    - [Metrics](#metrics)
    - [Tracing and Telemetry](#tracing-and-telemetry)
- [Project status](#project-status)
- [Compatability & Support](#compatability--support)
- [Acknowledgement](#acknowledgement)

---

# Theory

## Motivation

**`exthos`** brings together `javascript` for its ubiquity and ease of use and `golang` for its high performance nature to solve *`stream processing problem`*.

javascript is the most common programming language (source: stackoverflow). The popularity seems to stem from the fact that is it both light weight and easy to integrate with other frameworks/languages. However, it is just not made for heavy compute, and stream processing often requires that. On the other hand, golang's speed, simplicity and memory efficiency pegs it as a great candidate for compute heavy workloads.

exthos attempts to bring the two together to provide a streaming processing engine with intuitive APIs - heavily inspired by the Apache Camel project.

javascript with typescript provides a solid foundation for building a Domain Specific Language (DSL). exthos attempts to bring streaming/integration DSL to work with otherwise a configuration based stream engine called benthos.

## How exthos works

`exthos` has two modes of operations:

- local `isLocal=true`: In this mode, the engine takes on the responsibility of managning the engineProcess itself
- remote `isLocal=false`: In this mode, the engine communicates with a remote engineProcess over HTTP

> The default mode is `isLocal=true`

The remote mode can be used for deploying into remote benthos processes, and in the future will also be used to define the `exthos deployment framework`

## How to use exthos

exthos has two set of APIs:

- the low level APIs and
- the high level APIs

**Users are encouraged to use the HL APIs**, although an overview of the LL APIs helps to create a good foundation.

### Overview: Low level APIs

At the core of exthos is the `engine` that is responsible for running the `engineProcess`. The `engineProcess` is esentially a child process that runs benthos (in streams mode).
`streams` represent inputs connected to outputs, optionally via a pipeline containing processors and are created using: `new Stream(...)`. Stream objects are added to the engine instance at will using: `engine.add(stream)`. The streams can be updated or removed from the engine at will as well using: `engine.update(), engine.remove()`.

### Overview: High level APIs

The high level APIs abstract a lot of complexity away from the user and enabling the users to focus on the integration/streaming problem. As mentioned before, HLAPIs are heavity inspired by Apache Camel's DSL, however it is important to note that there is no overlap or commonality between exthos and Camel.

While using HLAPIs, the users create what we call a `route`. Internally, a route is akin to a LLAPI stream.
A simple route would consist of an input and an output specified in a fluent API manner using `from` and `to` constructs. eg: `let route01 = from(...).to(...)`

Once a route is created, one can start it. Internally, exthos starts the engine if not running and adds the route to the engine. e.g. `route01.start()`

The route can subsequently be stopped using: `route01.stop()`

## Components

### Inputs

`exthos` supports a number of inputs as sources of data. Take a look [here](./src/types/inputs.ts).

Some specials inputs are:

- `inport`: enables sending data from JS-land to goland-land
- `direct`: acts as as alias and can be used to receive data from another `direct` output

### Outputs

`exthos` supports a number of outputs as destinations of data. Take a look [here](./src/types/outputs.ts).

Some specials outputs are:

- `outport`: enables receiving data from goland-land to JS-land
- `direct`: acts as as alias and can be used to send data to another `direct` input

### Processors

`exthos` supports a number of processors. Procesors are used to act on a stream of data to perform operations such as lookup, filter, enrichment etc. Take a look [here](./src/types/processors.ts).

Some specials processors are:

- `javascript`: allows you to write javascript to manipulate `content` and `meta` of the messages

### Messages

`messages` are the events that are produced by sources, processed by processors and consumed by destinations.
messages are always part of a `batch`. If unspcified, a batch contains a single message only. However, you can create batches of multiple messages and operate on them.
Each message contains three parts:

- `meta`: contains the metadata for the message as key value pairs
- `content`: contains the actual data you may be intereted it. This data can be anything e.g. raw bytes, structured JSON, text etc.
- `error`: contains description of the error associated with a message. This is important to note, **because messages are not dropped on error**. i.e. if a processor fails on a message, the error property is tagged with the error description and the message is moved to the next processor.

---

# In practice

## Installation

`npm i exthos`

## Usage

Now that you hopefully have a fair idea of what Benthos is and is not, it's time to get your hands dirty.

A good starting point is to read the notes below and then head to the `examples` folders.

## Using high level APIs: from/via/to

The following examples illustrate the basic usage. Most examples below make use of `bloblang`; please refer to [link](https://www.benthos.dev/docs/guides/bloblang/about) for details on how to use it.

```js
// import the required constructs
import { from, to } from "exthos"

// example: create a route, start it and stop it after 5 seconds
from({ generate: { mapping: 'root = count("gen")' } }).to({ stdout: {} }).start().stopAfter(5000)

// example: create a route with a terminating source and start it.
// generate input with count = 2 will geenrate 2 msgs and 
from({ generate: { mapping: 'root = count("gen")', count: 2 } }).to({ stdout: {} }).start()
// no need to specify stop explicitly here as the route will stop after 2 messages are processed
```

For more examples refer to: [examples dir]([/examples/hlapis/README.md](https://github.com/exthosdev/exthos/tree/main/examples/hlapis))

## Other/non-functional features

### Labels

> this secions covers `llapis` only

Labels can be optionally assigned to all components. They aid in debugging and tracing.
The labels will be sanitised by the stream instace to follow the following rules:

- should match the regular expression /^[a-z0-9_]+$/
- must not start with an underscore

### Error handling

> this section covers `hlapis` only

`exthos` makes best attempt at swallowing any errors generated

There are two source of errors we must handle:

1. errors in JS land
   1. For JS land, errors can be handled using `try(){}catch(){}finally(){}` or `<Promise>.then().catch().finally()`
   2. Checkout the examples [here](https://github.com/exthosdev/exthos/blob/main/examples/hlapis/errorHandling.js)
2. errors in Golang land
   1. For Golang land, stream and message related errors must be handled using the component configurations, which are then handed over to benthos. As a rule of thumb, when an error occurs on a message, the error property of the message is marked with the error description and the message moves to the next component of the stream. To understand error handling please go through [this link](https://www.benthos.dev/docs/configuration/error_handling/)

### Logging

`exthos` makes use of the debug package to log output to stdout.

You can configure the debug namespace using one of the following:

1. `DEBUG=...*` environment variable
2. When initializing the engine
   1. llapi: `new Engine({}, {debugNamespace: "...*"})`
   2. hlapi: `engine.setEngineConfigOptions({}, {debugNamespace: "...*"})`

The default namespace is nil i.e. = ""

The following namespaces are available within `exthos`:

|namespace|description|
|---|---|
| exthos* | all exthos logs |
| exthos:engine:* | engine logs of all `log types`; engine logs originate in the Javascript/Node land |
| exthos:engineProcess:* | engineProcess logs of all `log levels`; engineProcess logs originate from the golang runtime |
| exthos:engine:debugLog | engine logs of debugLog type, providing info debug and info level information |
| exthos:engine:traceLog | engine logs of traceLog type, providing very detailed trace level information such as flow of code execution |
| exthos:eventLog* | all eventLog type, providing events generated as a log; each logline is a JSON containing the `eventObj` |
| exthos:eventLog:`<eventName>` | eventLog type with an `<eventName>` eventName, refer to [Events](#events) for complete list of `<eventName>s`|
| exthos:engineProcess:trace |  engineProcess logs of trace level |
| exthos:engineProcess:debug |  engineProcess logs of debug level |
| exthos:engineProcess:info |  engineProcess logs of info level |
| exthos:engineProcess:warn |  engineProcess logs of warn level |
| exthos:engineProcess:error |  engineProcess logs of error level |
| exthos:engineProcess:fatal |  engineProcess logs of fatal level |

### Events

`exthos` emits a lot of events. These can be used to trigger custom actions (aka handlers) in JS-land e.g. sending an alert notification on an `error` type category, or stopping the engine on a `fatal` type category, etc.

- You could provide your own event handling functions (actions/handlers) using any of the following. For even more options on how to handle events refer to [EventEmitter2](https://github.com/hij1nx/EventEmitter2#readme) documentation
  - `engine.on("<eventName>", (eventObj) => {...})`
  - `engine.onAny((eventName, eventObj) => {...})` - listens to all events geenrated by the engine and allows you to handle them at one place
- Or, you could use the builtin default event handler using: `engine.useDefaultEventHandler()`
  - the default event hander prints all events on the console/stdout,
  - stops the stream on receiving an "engineProcess.stream.error" event 5 times

> As mention under [Logging](#logging), all events are also logged under `exthos:eventLog` namespace

All possible events are shown in the table below:

| Event name (eventName)| Event category | Event Object properties (eventObj) | Description |
| -- | -- | -- | -- |
| `engine.active` | general | `{msg: string, time: string}` | signifies that the engine is running |
| `engine.inactive` | general | `{msg: string, time: string}` | signifies that the engine is NOT running |
| `engine.warn` | warn | `{msg: string, time: string, error: Error}` | signifies a potential abnormality that was ignored/recovered |
| `engine.error` | error | `{msg: string, time: string, error: Error}` | signifies a failure to an operation, not the entire engine |
| `engine.fatal` | fatal | `{msg: string, time: string, error: Error}` | signifies a failure to the entire engine, leading to shutdown of the engine |
| `engine.stream.add` | general | `{msg: string, time: string, stream: Stream}` | signifies that a stream has been added to the engine |
| `engine.stream.update` | general | `{msg: string, time: string, stream: Stream}` | signifies that a stream has been updated to the engine |
| `engine.stream.remove` | general | `{msg: string, time: string, stream: Stream}` | signifies that a stream has been removed from the engine |
| `engine.stream.error` | error | `{msg: string, time: string, stream: Stream, error: Error}` | signifies an error when the engine tried to add/update/remove the stream from the engine |
| `engineProcess.stream.fatal` | fatal | `{msg: string, time: string, stream: Stream, error: Error}` | jury is out on when engineProcess emits this |
| `engineProcess.stream.error` | error | `{msg: string, time: string, stream: Stream, error: Error}` | jury is out on when engineProcess emits this |
| `engineProcess.stream.warn` | error | `{msg: string, time: string, stream: Stream, error: Error}` | jury is out on when engineProcess emits this |
| `engineProcess.stream.info` | error | `{msg: string, time: string, stream: Stream, error: Error}` | jury is out on when engineProcess emits this |
| `engineProcess.stream.debug` | error | `{msg: string, time: string, stream: Stream, error: Error}` | jury is out on when engineProcess emits this |
| `engineProcess.stream.trace` | error | `{msg: string, time: string, stream: Stream, error: Error}` | jury is out on when engineProcess emits this |

Each event emits the `eventObj` that takes the form of `{ stream?: Stream, msg: string }` i.e. it always contains the `msg` string value and may contain the `stream` object if the event was generated in the context of a stream.

### Metrics

Coming soon.

### Tracing and Telemetry

Coming soon.

# Project status

exthos is under heavy development, but **ready to be used in production for light usage**

# Compatability & Support

- only linux based OS will work
- exthos to benthos compatability mapping follows:

|exthos|benthos|
|--|--|
|v0.0.1 - v0.2.1 | v4.5.1 |

# Acknowledgement

While we thank all the projects that exthos depends on, we would like to show special gratitude towards the following projects:

- [benthos](https://github.com/benthosdev/benthos)
- [nanomsg](https://github.com/nickdesaulniers/node-nanomsg)
- [eventemitter2](https://github.com/hij1nx/EventEmitter2)
- [debug](https://github.com/debug-js/debug)
- [async-mutex](https://github.com/DirtyHairy/async-mutex)