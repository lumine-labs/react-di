import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CleanupRegistry } from "../../src/module-cleanup/cleanup-registry.js"
import { cleanupModuleResolution } from "../../src/module/useModule.js"
import type { DependencyContainer } from "../../src/aliases/index.js"

function createContainerMock({
    withRegistry = true,
    disposeResult,
}: {
    withRegistry?: boolean
    disposeResult?: void | Promise<void>
}) {
    const run = vi.fn(async () => {})
    const registry = { run }

    const container = {
        isRegistered: vi.fn(() => withRegistry),
        resolve: vi.fn(() => registry),
        dispose: vi.fn(() => disposeResult),
    } as unknown as DependencyContainer

    return {
        container,
        run,
    }
}

describe("cleanupModuleResolution", () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("runs init cleanup immediately and schedules registry/dispose for owned modules", async () => {
        const calls: string[] = []
        const { container, run } = createContainerMock({ withRegistry: true })
        run.mockImplementation(async () => {
            calls.push("registry")
        })
        ;(container as any).dispose.mockImplementation(() => {
            calls.push("dispose")
        })

        cleanupModuleResolution({
            container,
            owned: true,
            cleanup: () => {
                calls.push("init-cleanup")
            },
        })

        expect(calls).toEqual(["init-cleanup"])

        await vi.runAllTimersAsync()

        expect(calls).toEqual(["init-cleanup", "registry", "dispose"])
        expect((container as any).isRegistered).toHaveBeenCalledWith(CleanupRegistry, false)
        expect((container as any).dispose).toHaveBeenCalledTimes(1)
    })

    it("does not dispose inherited modules", async () => {
        const { container, run } = createContainerMock({ withRegistry: true })

        cleanupModuleResolution({
            container,
            owned: false,
        })

        await vi.runAllTimersAsync()

        expect(run).not.toHaveBeenCalled()
        expect((container as any).dispose).not.toHaveBeenCalled()
    })

    it("still disposes when cleanup registry is not registered", async () => {
        const { container, run } = createContainerMock({ withRegistry: false })

        cleanupModuleResolution({
            container,
            owned: true,
        })

        await vi.runAllTimersAsync()

        expect(run).not.toHaveBeenCalled()
        expect((container as any).dispose).toHaveBeenCalledTimes(1)
    })

    it("catches sync cleanup errors", () => {
        const { container } = createContainerMock({ withRegistry: false })
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

        cleanupModuleResolution({
            container,
            owned: false,
            cleanup: () => {
                throw new Error("cleanup failed")
            },
        })

        expect(errorSpy).toHaveBeenCalledTimes(1)
        errorSpy.mockRestore()
    })

    it("catches cleanup registry errors and still attempts dispose", async () => {
        const { container } = createContainerMock({ withRegistry: true })
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

        ;(container as any).resolve.mockImplementation(() => {
            throw new Error("registry failed")
        })

        cleanupModuleResolution({
            container,
            owned: true,
        })

        await vi.runAllTimersAsync()

        expect((container as any).dispose).toHaveBeenCalledTimes(1)
        expect(errorSpy).toHaveBeenCalled()
        errorSpy.mockRestore()
    })

    it("catches dispose errors", async () => {
        const { container } = createContainerMock({ withRegistry: false })
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

        ;(container as any).dispose.mockImplementation(() => {
            throw new Error("dispose failed")
        })

        cleanupModuleResolution({
            container,
            owned: true,
        })

        await vi.runAllTimersAsync()

        expect(errorSpy).toHaveBeenCalled()
        errorSpy.mockRestore()
    })

    it("supports async dispose for owned modules", async () => {
        const calls: string[] = []
        let resolveDispose!: () => void

        const disposeDone = new Promise<void>((resolve) => {
            resolveDispose = resolve
        })

        const { container } = createContainerMock({ withRegistry: true })
        ;(container as any).resolve.mockImplementation(() => ({
            run: async () => {
                calls.push("registry")
            },
        }))
        ;(container as any).dispose.mockImplementation(() => {
            calls.push("dispose:start")
            return disposeDone.then(() => {
                calls.push("dispose:end")
            })
        })

        cleanupModuleResolution({
            container,
            owned: true,
        })

        await vi.runAllTimersAsync()
        expect(calls).toEqual(["registry", "dispose:start"])

        resolveDispose()
        await Promise.resolve()
        await Promise.resolve()

        expect(calls).toEqual(["registry", "dispose:start", "dispose:end"])
    })
})
