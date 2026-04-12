import { describe, expect, it, vi } from "vitest"
import { AsyncTeardown } from "../../src/module-cleanup/async-teardown.js"

describe("AsyncTeardown", () => {
    it("runs higher priority cleanups first", async () => {
        const teardown = new AsyncTeardown()
        const calls: string[] = []

        teardown.add(() => {
            calls.push("p1:first")
        }, 1)
        teardown.add(() => {
            calls.push("p10")
        }, 10)
        teardown.add(() => {
            calls.push("p1:second")
        }, 1)

        await teardown.run()
        expect(calls).toEqual(["p10", "p1:first", "p1:second"])
    })

    it("runs callbacks with the same priority in parallel as one batch", async () => {
        const teardown = new AsyncTeardown()
        const calls: string[] = []

        let resolveHigh!: () => void
        const highDone = new Promise<void>((resolve) => {
            resolveHigh = resolve
        })

        teardown.add(async () => {
            calls.push("high:start")
            await highDone
            calls.push("high:end")
        }, 10)

        teardown.add(async () => {
            calls.push("low:A")
        }, 1)
        teardown.add(async () => {
            calls.push("low:B")
        }, 1)

        const runPromise = teardown.run()
        await Promise.resolve()

        expect(calls).toEqual(["high:start"])

        resolveHigh()
        await runPromise

        expect(calls).toEqual(["high:start", "high:end", "low:A", "low:B"])
    })

    it("returns unsubscribe function from add()", async () => {
        const teardown = new AsyncTeardown()
        const cleanup = vi.fn()

        const unsubscribe = teardown.add(cleanup, 5)
        unsubscribe()

        await teardown.run()
        expect(cleanup).not.toHaveBeenCalled()
    })

    it("clears callbacks after run", async () => {
        const teardown = new AsyncTeardown()
        const cleanup = vi.fn()

        teardown.add(cleanup, 0)
        await teardown.run()
        await teardown.run()

        expect(cleanup).toHaveBeenCalledTimes(1)
    })

    it("logs errors and still executes remaining callbacks", async () => {
        const teardown = new AsyncTeardown()
        const calls: string[] = []
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

        teardown.add(() => {
            throw new Error("fail:high")
        }, 10)
        teardown.add(() => {
            calls.push("ok:high")
        }, 10)
        teardown.add(async () => {
            throw new Error("fail:low")
        }, 1)
        teardown.add(() => {
            calls.push("ok:low")
        }, 1)

        await expect(teardown.run()).resolves.toBeUndefined()
        expect(calls).toEqual(["ok:high", "ok:low"])
        expect(errorSpy).toHaveBeenCalledTimes(2)
        errorSpy.mockRestore()
    })
})
