import { Stream } from "./stream/stream.js";
import exthos from "./index";
// OR: import * as exthos_2 from "./index.js"

describe("test group description", () => {
  beforeAll(() => {
    // do something
    exthos.engine.onAny(
      (eventName: string | string[], eventObj: { stream: Stream }) => {
        if (eventName === "engine.fatal") {
          throw new Error(
            (eventObj as any)["msg"] ||
              "engine.fatal occured, but msg was absent in the eventObj.msg"
          );
        }
      }
    );
    exthos.engine.updateEngineConfigOptions({
      logger: { level: "NONE", format: "json" },
    });
  });

  test("engine start and stop from src/index.js", async () => {
    // note the async keyword here
    // expect.assertions(2)
    // let promStart = exthos.engine.start()
    // await expect(promStart).resolves.not.toThrow()
    // let promStop = exthos.engine.stop()
    // await expect(promStop).resolves.not.toThrow()
  });
});
