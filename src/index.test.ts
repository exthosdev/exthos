import exthos from "./index"
// OR: import * as exthos_2 from "./index.js"

describe('test group description', () => {
    beforeAll(() => {
        // do something
    });

    // test that promise resolves
    test('start and stop engine', async () => {          // note the async keyword here
        expect.assertions(2)
        let promStart = exthos.engine.start()
        await expect(promStart).resolves.not.toThrow()

        let promStop = exthos.engine.stop()
        await expect(promStop).resolves.not.toThrow()
    })
})