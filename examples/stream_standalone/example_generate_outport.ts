import exthos from "../../src/index.js";

let stream = new exthos.Stream({
    input: { generate: { mapping: `root = "hello outport"` } },
    output: { outport: {} }
}, true)


stream.outPort.on("data", (d) => {
    console.log(`rec data: ${d.toString()}`)
})
