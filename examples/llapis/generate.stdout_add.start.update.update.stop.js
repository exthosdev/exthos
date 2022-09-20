import * as exthos from "../../dist/index.js";

let engine = new exthos.Engine({});
engine.useDefaultEventHandler({
  "engine.fatal": (eventObj) => {
    console.log("\nTest EXITED with CODE=1", JSON.stringify(eventObj));
    process.exit(1);
  },
});

let stream1 = new exthos.Stream({
  input: { generate: { mapping: 'root = "world"' } },
  output: { stdout: {} },
});
engine.add(stream1);
engine.start();

// update stream
setTimeout(() => {
  stream1.streamConfig = {
    ...stream1.streamConfig,
    ...{
      pipeline: {
        processors: [{ bloblang: `root = "hello " + content()` }],
      },
    },
  };
  engine.update(stream1);
}, 1000);

// another way to update a stream
setTimeout(() => {
  stream1.streamConfig.pipeline?.processors.push({
    bloblang: `root = content() + " again!"`,
  });
  engine.update(stream1);
}, 2000);

// stop the engine and all its streams after 5 seconds
setTimeout(() => {
  engine.stop();
}, 5000);
