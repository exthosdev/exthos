import * as exthos from "../../dist/index.js";

let engine = new exthos.Engine({});
engine.useDefaultEventHandler({
  "engine.fatal": (eventObj) => {
    console.log("\nTest EXITED with CODE=1", JSON.stringify(eventObj));
    process.exit(1);
  },
});

let stream1 = new exthos.Stream({
  input: { file: { paths: ["./testdata/data1"] } },
  output: {
    file: {
      path: './testdata/copy_${! meta("path").filepath_split().1}',
      codec: "all-bytes",
    },
  },
});

engine.add(stream1);
engine.start();

/**
 * here, the engine will remove the stream once the file transfer is completed, since status will turn inactive
 * OR if the file didnt exist the engine will remove
 */
