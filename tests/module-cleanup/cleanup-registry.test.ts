import { describe, expect, it, vi } from "vitest"
import { CleanupRegistry } from "../../src/module-cleanup/cleanup-registry.js"

describe("CleanupRegistry", () => {
    it("runs cleanup callbacks in reverse registration order", async () => {
        const registry = new CleanupRegistry()
        const calls: string[] = []

        registry.add(() => {
            calls.push("first")
        })
        registry.add(() => {
            calls.push("second")
        })
        registry.add(() => {
            calls.push("third")
        })

        await registry.run()
        expect(calls).toEqual(["third", "second", "first"])
    })

    it("supports async cleanups and awaits them in order", async () => {
        const registry = new CleanupRegistry()
        const calls: string[] = []

        registry.add(async () => {
            await Promise.resolve()
            calls.push("A")
        })
        registry.add(async () => {
            await Promise.resolve()
            calls.push("B")
        })

        await registry.run()
        expect(calls).toEqual(["B", "A"])
    })

    it("runs serial cleanups before parallel cleanups", async () => {
        const registry = new CleanupRegistry()
        const calls: string[] = []

        let resolveParallel!: () => void
        const parallelDone = new Promise<void>((resolve) => {
            resolveParallel = resolve
        })

        registry.add(
            async () => {
                calls.push("parallel:start")
                await parallelDone
                calls.push("parallel:end")
            },
            { mode: "parallel" }
        )

        registry.add(() => {
            calls.push("serial")
        })

        const runPromise = registry.run()
        await Promise.resolve()

        expect(calls).toEqual(["serial"])

        resolveParallel()
        await runPromise

        expect(calls).toEqual(["serial", "parallel:start", "parallel:end"])
    })

    it("isolates cleanup errors and continues execution", async () => {
        const registry = new CleanupRegistry()
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
        const calls: string[] = []

        registry.add(() => {
            throw new Error("fail")
        })
        registry.add(() => {
            calls.push("ok")
        })

        await registry.run()
        expect(calls).toEqual(["ok"])
        expect(errorSpy).toHaveBeenCalledTimes(1)

        errorSpy.mockRestore()
    })

    it("removes callbacks after run", async () => {
        const registry = new CleanupRegistry()
        const cleanup = vi.fn()

        registry.add(cleanup)
        await registry.run()
        await registry.run()

        expect(cleanup).toHaveBeenCalledTimes(1)
    })

    it("returns unsubscribe function from add()", async () => {
        const registry = new CleanupRegistry()
        const cleanup = vi.fn()

        const unsubscribe = registry.add(cleanup)
        unsubscribe()

        await registry.run()
        expect(cleanup).not.toHaveBeenCalled()
    })

    it("supports unsubscribe for parallel cleanup", async () => {
        const registry = new CleanupRegistry()
        const cleanup = vi.fn()

        const unsubscribe = registry.add(cleanup, { mode: "parallel" })
        unsubscribe()

        await registry.run()
        expect(cleanup).not.toHaveBeenCalled()
    })

    it("continues execution when both serial and parallel cleanups fail", async () => {
        const registry = new CleanupRegistry()
        const calls: string[] = []
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

        registry.add(() => {
            calls.push("serial:ok")
        })
        registry.add(() => {
            throw new Error("serial:fail")
        })
        registry.add(
            async () => {
                calls.push("parallel:ok")
            },
            { mode: "parallel" }
        )
        registry.add(
            async () => {
                throw new Error("parallel:fail")
            },
            { mode: "parallel" }
        )

        await registry.run()

        expect(calls).toContain("serial:ok")
        expect(calls).toContain("parallel:ok")
        expect(errorSpy).toHaveBeenCalledTimes(2)
        errorSpy.mockRestore()
    })
})
