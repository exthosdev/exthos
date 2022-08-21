import exthos from "../../src/index.js" // exthos;


let stream = new exthos.Stream({
    input: {generate: {mapping: `root = "am going to talk twice"`}},
    output: {stdout: {}}
})

setTimeout(() => {
    stream.stop()
}, 2000);

await stream.start()
