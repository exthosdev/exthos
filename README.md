> stream processing in nodejs using the power of golang

Website: https://exthosdev.github.io/exthos/

# Motivation
**`exthos`** brings together `javascript` for its ubiquity and ease of use and `golang` for its high performance nature to solve *`stream processing problem`*.

javascript is the most common programming language (source: stackoverflow). The popularity seems to stem from the fact that is it both light weight and easy to integrate with other frameworks/languages. However, it is just not made for heavy compute, and stream processing often requires that. On the other hand, golang's speed, simplicity and memory efficiency pegs it as a great candidate for compute heavy workloads.

exthos attempts to bring the two together to provide a streaming processing engine with intuitive APIs - heavily inspired by the Apache Camel project.

Acknowledgement: exthos makes heavy use of benthos, which is an amazing stream processing package written in golang. While benthos promotes file based configuration, exthos promotes the use of Integration DSL within Javascript.

# How exthos works

exthos has two set of APIs: 
- the low level APIs and 
- the high level APIs. 
   
**Users are encouraged to use the HL APIs**, although an overview of the LL APIs helps to create a good foundation. 

## Overview: Low level APIs
At the core of exthos is the `engine` that is responsible for running the `engineProcess`. The `engineProcess` is esentially a child process that runs benthos (in streams mode). 
`streams` represent inputs connected to outputs, optionally via a pipeline containing processors and are created using: `new Stream(...)`. During development, these streams can be run in standalone mode i.e. without an engine using: `stream.start()`. However, one must not run stream in standalone mode in production. The preferred way is to add stream objects into the engine instance at will using: `engine.add(stream)`. The streams can be updated or removed from the engine as well using: `engine.update(), engine.remove()`.

The engine produces a *lot of events* that can be listened to for specific actions. e.g. to notify your Operations team when an error occurs in one of the streams using `engine.stream.error` event. 
- You could provide your own event handling functions using any of the following: `engine.on(...)` or `engine.onAny(...)`. Refer to the documentation of the package named EventEmitter2 for details.
- Or, you could use the builtin default event handler using: `engine.useDefaultEventHandler()`
- Each event emits the `eventObj` that takes the form of `{ stream?: Stream, msg: string }` i.e. it always contains the `msg` string value and may contain the `stream` object if the event was generated in the context of a stream.

## Overview: High level APIs
The high level APIs abstract a lot of complexity away from the user and enabling the users to focus on the integration/streaming problem. As mentioned before, HLAPIs are heavity inspired by Apache Camel's DSL, however it is important to note that there is no overlap or commonality between exthos and Camel.

While using HLAPIs, the users create what we call a `route`. Internally, a route is akin to a LLAPI stream.
A simple route would consist of an input and an output specified in a fluent API manner using `from` and `to` constructs. eg: `let route01 = from(...).to(...)`

Once a route is created, one can start it. Internally, exthos starts the engine if not running and adds the route to the engine. e.g. `route01.start()`

The route can subsequently be stopped using: `route01.stop()`

## Inputs
`exthos` supports a number of inputs as sources of data. Take a look [here](./src/types/inputs.ts).

Some specials inputs are:
- `inport`: enables sending data from JS-land to goland-land
- `direct`: acts as as alias and can be used to receive data from another `direct` output

## Outputs
`exthos` supports a number of outputs as destinations of data. Take a look [here](./src/types/outputs.ts).

Some specials outputs are:
- `outport`: enables receiving data from goland-land to JS-land
- `direct`: acts as as alias and can be used to send data to another `direct` input

## Processors 
`exthos` supports a number of processors. Procesors are used to act on a stream of data to perform operations such as lookup, filter, enrichment etc. Take a look [here](./src/types/processors.ts).

Some specials processors are:
- `javascript`: allows you to write javascript to manipulate `content` and `meta` of the messages

## Messages
`messages` are the events that are produced by sources, processed by processors and consumed by destinations.
messages are always part of a `batch`. If unspcified, a batch contains a single message only. However, you can create batches of multiple messages and operate on them.
Each message contains three parts:
- `meta`: contains the metadata for the message as key value pairs 
- `content`: contains the actual data you may be intereted it. This data can be anything e.g. raw bytes, structured JSON, text etc.
- `error`: contains description of the error associated with a message. This is important to note, **because messages are not dropped on error**. i.e. if a processor fails on a message, the error property is tagged with the error description and the message is moved to the next processor.

# Usage
Now that you hopefully have a fair idea of what Benthos is and is not, it's time to get your hands dirty.

A good starting point is to read the notes below and then head to the `examples` folders.

## Using high level APIs: from/via/to

The following examples illustrate the basic usage. Most examples below make use of `bloblang`; please refer to [link](https://www.benthos.dev/docs/guides/bloblang/about) for details on how to use it.
```js
// import the required constructs
import { from, to } from "exthos"

// example: create a route, start it and stop it after 5 seconds
from({ generate: { mapping: 'root = count("gen")' } }).to({ stdout: {} }).start().stopAfter("5s")

// example: create a route with a terminating source and start it.
// generate input with count = 2 will geenrate 2 msgs and 
from({ generate: { mapping: 'root = count("gen")', count: 2 } }).to({ stdout: {} }).start()
// no need to specify stop explicitly here as the route will stop after 2 messages are processed
```

For more examples refer to: [examples dir](/examples/hlapis/README.md)

# Other/non-functional features

## error handling
Error handling 

## logging
exthos makes use of the fabulous debug module. The namespaces that can be configured with `DEBUG=` are:
```
    - exthos*
    - exthos:engine:*
    - exthos:engineProcess:*
```
## metrics
Coming soon.
