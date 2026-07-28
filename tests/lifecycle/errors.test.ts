import { afterEach, describe, expect, it, vi } from "vitest"

import type { ModulePhase } from "../../src/core/providers/module-lifecycle/module-lifecycle.types.js"
import { makeApp, makeChild, phase, tracked } from "../setup/helpers.js"

// Hook errors.
// ========================================
//
// Without `onModuleError` the first three phases throw — React renders and effects surface them — while
// destroy has nobody to reject into and is logged instead. With a handler, all four are handed over and
// nothing escapes. Either way init is the odd one out: one try wraps the whole phase, because a failure
// there means a half-built module and the remaining hooks would be running against it.

afterEach(() => {
    vi.restoreAllMocks()
})

describe("without onModuleError", () => {
    it("throws out of init", () => {
        const log: string[] = []

        expect(() =>
            makeApp({
                providers: [tracked(log, "A"), tracked(log, "B", { throwOn: "init" })],
            })
        ).toThrow("B init")
    })

    it("throws out of mount", () => {
        const log: string[] = []
        const module = makeApp({
            providers: [tracked(log, "A"), tracked(log, "B", { throwOn: "mount" })],
        })

        expect(() => module.mount()).toThrow("B mount")
    })

    it("throws out of unmount", () => {
        const log: string[] = []
        const module = makeApp({
            providers: [tracked(log, "A"), tracked(log, "B", { throwOn: "unmount" })],
        })
        module.mount()

        expect(() => module.unmount()).toThrow("B unmount")
    })

    it("logs a destroy error instead of rejecting", async () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
        const log: string[] = []
        const module = makeApp({
            providers: [tracked(log, "A"), tracked(log, "B", { throwOn: "destroy" })],
        })
        module.mount()
        module.unmount()

        await expect(module.destroy()).resolves.toBeUndefined()

        expect(errorSpy).toHaveBeenCalledTimes(1)
        expect(errorSpy.mock.calls[0]?.[0]).toBe("module.destroy")
        expect((errorSpy.mock.calls[0]?.[1] as Error).message).toBe("B destroy")
    })

    it("keeps destroying the rest after one hook throws", async () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
        const log: string[] = []
        const first = tracked(log, "A")
        const last = tracked(log, "C")
        const module = makeApp({
            providers: [first, tracked(log, "B", { throwOn: "destroy" }), last],
        })
        module.mount()
        module.unmount()
        log.length = 0

        await module.destroy()

        expect(log).toEqual(["C:destroy", "A:destroy"])
        expect([first.counts.destroy, last.counts.destroy]).toEqual([1, 1])
        expect(errorSpy).toHaveBeenCalledTimes(1)
    })

    /**
     * Characterisation: a mount hook that throws aborts the cascade where it stands — the module is never
     * marked mounted and its children never receive their mount. `onModuleError` is the way out.
     */
    it("aborts the mount cascade when a parent hook throws", () => {
        const log: string[] = []
        const childService = tracked(log, "C")
        const parent = makeApp({
            providers: [tracked(log, "P", { throwOn: "mount" })],
        })
        const child = makeChild(parent, { providers: [childService] })
        child.mount()

        expect(() => parent.mount()).toThrow("P mount")
        expect(childService.counts.mount).toBe(0)
    })
})

describe("with onModuleError", () => {
    it("hands every phase to the handler and lets nothing escape", async () => {
        const phases: ModulePhase[] = ["init", "mount", "unmount", "destroy"]

        for (const failing of phases) {
            const log: string[] = []
            const seen: string[] = []
            const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

            const module = makeApp({
                providers: [tracked(log, "A"), tracked(log, "B", { throwOn: failing }), tracked(log, "C")],
                onModuleError: (reportedPhase, error) => seen.push(`${reportedPhase}:${(error as Error).message}`),
            })
            module.mount()
            module.unmount()
            // eslint-disable-next-line no-await-in-loop
            await module.destroy()

            expect(seen).toEqual([`${failing}:B ${failing}`])
            expect(errorSpy).not.toHaveBeenCalled()
            errorSpy.mockRestore()
        }
    })

    it("abandons the rest of the init phase", () => {
        const log: string[] = []
        const first = tracked(log, "A")
        const last = tracked(log, "C")
        makeApp({
            providers: [first, tracked(log, "B", { throwOn: "init" }), last],
            onModuleError: () => undefined,
        })

        expect(phase(log, "init")).toEqual(["A:init"])
        expect([first.counts.init, last.counts.init]).toEqual([1, 0])
    })

    it("carries on through the mount phase", () => {
        const log: string[] = []
        const module = makeApp({
            providers: [tracked(log, "A"), tracked(log, "B", { throwOn: "mount" }), tracked(log, "C")],
            onModuleError: () => undefined,
        })
        log.length = 0

        module.mount()

        expect(log).toEqual(["A:mount", "C:mount"])
    })

    it("carries on through the unmount phase", () => {
        const log: string[] = []
        const module = makeApp({
            providers: [tracked(log, "A"), tracked(log, "B", { throwOn: "unmount" }), tracked(log, "C")],
            onModuleError: () => undefined,
        })
        module.mount()
        log.length = 0

        module.unmount()

        expect(log).toEqual(["C:unmount", "A:unmount"])
    })

    it("carries on through the destroy phase", async () => {
        const log: string[] = []
        const module = makeApp({
            providers: [tracked(log, "A"), tracked(log, "B", { throwOn: "destroy" }), tracked(log, "C")],
            onModuleError: () => undefined,
        })
        module.mount()
        module.unmount()
        log.length = 0

        await module.destroy()

        expect(log).toEqual(["C:destroy", "A:destroy"])
    })

    it("keeps mounting the children after a parent hook failed", () => {
        const log: string[] = []
        const childService = tracked(log, "C")
        const parent = makeApp({
            providers: [tracked(log, "P", { throwOn: "mount" })],
            onModuleError: () => undefined,
        })
        const child = makeChild(parent, { providers: [childService] })
        child.mount()
        log.length = 0

        parent.mount()

        expect(log).toEqual(["C:mount"])
        expect(childService.counts.mount).toBe(1)
    })

    it("reports a failing module hook under its own phase", () => {
        const log: string[] = []
        const seen: string[] = []
        const module = makeApp({
            providers: [tracked(log, "A")],
            onModuleMount: () => {
                throw new Error("module mount")
            },
            onModuleError: (reportedPhase, error) => seen.push(`${reportedPhase}:${(error as Error).message}`),
        })
        log.length = 0

        module.mount()

        expect(seen).toEqual(["mount:module mount"])
        // The module hook failing does not cost the providers their hook.
        expect(log).toEqual(["A:mount"])
    })

    it("costs every provider its init when the module init hook throws", () => {
        const log: string[] = []
        const service = tracked(log, "A")
        const seen: string[] = []
        makeApp({
            providers: [service],
            onModuleInit: () => {
                throw new Error("module init")
            },
            onModuleError: (reportedPhase, error) => seen.push(`${reportedPhase}:${(error as Error).message}`),
        })

        expect(seen).toEqual(["init:module init"])
        expect(service.counts.init).toBe(0)
        expect(log).toEqual(["A:ctor"])
    })

    it("hands the handler the original error object", () => {
        const seen: unknown[] = []
        const boom = new Error("boom")
        class Exploding {
            onModuleInit(): void {
                throw boom
            }
        }
        const module = makeApp({
            providers: [{ provide: Exploding, useValue: new Exploding() }],
            onModuleError: (_reportedPhase, error) => seen.push(error),
        })

        expect(seen).toEqual([boom])
        expect(module.container.resolve(Exploding)).toBeInstanceOf(Exploding)
    })

    it("reports once per failing instance, not once per phase", async () => {
        const log: string[] = []
        const seen: string[] = []
        const module = makeApp({
            providers: [
                tracked(log, "A", { throwOn: "unmount" }),
                tracked(log, "B", { throwOn: "unmount" }),
                tracked(log, "C"),
            ],
            onModuleError: (reportedPhase, error) => seen.push(`${reportedPhase}:${(error as Error).message}`),
        })
        module.mount()

        module.unmount()
        await module.destroy()

        expect(seen).toEqual(["unmount:B unmount", "unmount:A unmount"])
    })
})
