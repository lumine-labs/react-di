import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AsyncTeardown } from "../../src/core/providers/async-teardown/async-teardown.js"
import { cleanupModuleResolution } from "../../src/react/hooks/useModule"
import type { DependencyContainer } from "../../src/aliases/index.js"
import type { ModuleResolutionLifecycle } from "../../src/core/module/lifecycle.types.js"

function createContainerMock({
    withTeardown = true,
    disposeResult,
}: {
    withTeardown?: boolean
    disposeResult?: void | Promise<void>
}) {
    const run = vi.fn(async () => {})
    const teardown = { run }

    const container = {
        isRegistered: vi.fn(() => withTeardown),
        resolve: vi.fn(() => teardown),
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

    it("runs unmount immediately and schedules destroy/teardown/dispose for owned modules", async () => {
        const calls: string[] = []
        const { container, run } = createContainerMock({ withTeardown: true })
        run.mockImplementation(async () => {
            calls.push("teardown")
        })
        ;(container as any).dispose.mockImplementation(() => {
            calls.push("dispose")
        })

        cleanupModuleResolution(
            {
                container,
                owned: true,
            },
            {
                moduleHooks: {
                    onModuleUnmount: () => calls.push("module-unmount"),
                    onModuleDestroy: () => calls.push("module-destroy"),
                },
                lifecycleInstances: [
                    {
                        onModuleUnmount: () => calls.push("provider-unmount"),
                        onModuleDestroy: () => calls.push("provider-destroy"),
                    },
                ],
            }
        )

        expect(calls).toEqual(["provider-unmount", "module-unmount"])

        await vi.runAllTimersAsync()

        expect(calls).toEqual([
            "provider-unmount",
            "module-unmount",
            "teardown",
            "provider-destroy",
            "module-destroy",
            "dispose",
        ])
        expect((container as any).isRegistered).toHaveBeenCalledWith(AsyncTeardown, false)
        expect((container as any).dispose).toHaveBeenCalledTimes(1)
    })

    it("does not dispose inherited modules", async () => {
        const { container, run } = createContainerMock({ withTeardown: true })

        cleanupModuleResolution({ container, owned: false }, emptyLifecycle())

        await vi.runAllTimersAsync()

        expect(run).not.toHaveBeenCalled()
        expect((container as any).dispose).not.toHaveBeenCalled()
    })

    it("still disposes when async teardown is not registered", async () => {
        const { container, run } = createContainerMock({ withTeardown: false })

        cleanupModuleResolution({ container, owned: true }, emptyLifecycle())

        await vi.runAllTimersAsync()

        expect(run).not.toHaveBeenCalled()
        expect((container as any).dispose).toHaveBeenCalledTimes(1)
    })

    it("catches sync module/provider unmount errors", () => {
        const { container } = createContainerMock({ withTeardown: false })
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

        cleanupModuleResolution(
            {
                container,
                owned: false,
            },
            {
                moduleHooks: {
                    onModuleUnmount: () => {
                        throw new Error("module unmount failed")
                    },
                },
                lifecycleInstances: [
                    {
                        onModuleUnmount: () => {
                            throw new Error("provider unmount failed")
                        },
                    },
                ],
            }
        )

        expect(errorSpy).toHaveBeenCalledTimes(2)
        errorSpy.mockRestore()
    })

    it("catches async teardown errors and still attempts dispose", async () => {
        const { container } = createContainerMock({ withTeardown: true })
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

        ;(container as any).resolve.mockImplementation(() => {
            throw new Error("teardown failed")
        })

        cleanupModuleResolution({ container, owned: true }, emptyLifecycle())

        await vi.runAllTimersAsync()

        expect((container as any).dispose).toHaveBeenCalledTimes(1)
        expect(errorSpy).toHaveBeenCalled()
        errorSpy.mockRestore()
    })

    it("catches dispose errors", async () => {
        const { container } = createContainerMock({ withTeardown: false })
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

        ;(container as any).dispose.mockImplementation(() => {
            throw new Error("dispose failed")
        })

        cleanupModuleResolution({ container, owned: true }, emptyLifecycle())

        await vi.runAllTimersAsync()

        expect(errorSpy).toHaveBeenCalled()
        errorSpy.mockRestore()
    })

    it("runs destroy in LIFO order for providers", async () => {
        const calls: string[] = []
        const { container } = createContainerMock({ withTeardown: false })

        cleanupModuleResolution(
            {
                container,
                owned: true,
            },
            {
                lifecycleInstances: [
                    { onModuleDestroy: () => calls.push("first") },
                    { onModuleDestroy: () => calls.push("second") },
                    { onModuleDestroy: () => calls.push("third") },
                ],
            }
        )

        await vi.runAllTimersAsync()
        expect(calls).toEqual(["third", "second", "first"])
    })

    it("supports async dispose for owned modules", async () => {
        const calls: string[] = []
        let resolveDispose!: () => void

        const disposeDone = new Promise<void>((resolve) => {
            resolveDispose = resolve
        })

        const { container } = createContainerMock({ withTeardown: true })
        ;(container as any).resolve.mockImplementation(() => ({
            run: async () => {
                calls.push("teardown")
            },
        }))
        ;(container as any).dispose.mockImplementation(() => {
            calls.push("dispose:start")
            return disposeDone.then(() => {
                calls.push("dispose:end")
            })
        })

        cleanupModuleResolution({ container, owned: true }, emptyLifecycle())

        await vi.runAllTimersAsync()
        expect(calls).toEqual(["teardown", "dispose:start"])

        resolveDispose()
        await Promise.resolve()
        await Promise.resolve()

        expect(calls).toEqual(["teardown", "dispose:start", "dispose:end"])
    })
})

function emptyLifecycle(): ModuleResolutionLifecycle {
    return {
        moduleHooks: {},
        lifecycleTokens: [],
        lifecycleInstances: [],
    }
}
