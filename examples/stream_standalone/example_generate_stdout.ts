import exthos from "../../src/index.js" // exthos;


let stream = new exthos.Stream({
    input: {generate: {mapping: `root = "hi"`}},
    output: {stdout: {}}
})

stream.start()