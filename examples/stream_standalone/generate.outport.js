import * as exthos from "../../dist/index.js";

let stream = new exthos.Stream({
    input: { generate: { mapping: `root = count("gen")`, count: 2 } },
    output: { outport: {} }
}, true);

stream.outPort.on("data", (d) => {
    console.log(`rec data: ${d.toString()}`);
});