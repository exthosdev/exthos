import { Stream } from "./stream";

describe("test group description", () => {
  let stream: Stream;
  beforeEach(() => {
    stream = new Stream({
      input: { generate: { mapping: 'root = count("gen")' } },
      output: { stdout: {} },
    });
  });

  test("beforeAdd with nothing to do resolve with empty array", async () => {
    expect.assertions(1);
    let toTest = await stream.beforeAdd();
    expect(toTest).toHaveLength(0);

    // let promStop = exthos.engine.stop()
    // await expect(promStop).resolves.not.toThrow()
  });

  test("set streamConfig and check that defaults are set", async () => {
    let sc = stream.streamConfig;
    sc.input = { generate: { mapping: 'root = count("gen")', count: 1 } };
    stream.streamConfig = sc;
    expect(stream.streamConfig).toEqual({
      input: {
        label: "",
        generate: { mapping: 'root = count("gen")', count: 1, interval: "1s" },
      },
      output: {
        label: "",
        stdout: {
          codec: "lines",
        },
      },
    });
  });
});
