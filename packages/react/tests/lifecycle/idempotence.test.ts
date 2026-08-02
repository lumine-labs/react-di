import { describe, expect, it } from "vitest"

import { App } from "../../src/core/module/module.js"
import { makeApp, makeChild, tracked } from "../setup/helpers.js"

// Idempotence.
// ========================================
//
// React re-sends signals; the module collapses them. Every hook runs exactly once per instance,
// whether the repeats are sequential or concurrent.

describe("repeated signals", () => {
    it("collapses repeats of every phase into one of each", async () => {
        const log: string[] = []
        const service = tracked(log, "A")
        const childService = tracked(log, "C")
        const parent = makeApp({ providers: [service] })
        const child = makeChild(parent, { providers: [childService] })

        parent.mount()
        parent.mount()
        child.mount()
        child.mount()

        parent.unmount()
        parent.unmount()
        child.unmount()

        await parent.destroy()
        await child.destroy()
        await parent.destroy()

        expect(service.counts).toEqual({ init: 1, mount: 1, unmount: 1, destroy: 1 })
        expect(childService.counts).toEqual({ init: 1, mount: 1, unmount: 1, destroy: 1 })
    })

    it("ignores a second init", () => {
        const log: string[] = []
        const service = tracked(log, "A")
        const module = new App({ providers: [service], onModuleInit: () => log.push("module:init") })

        module.init()
        module.init()

        expect(service.counts.init).toBe(1)
        expect(log).toEqual(["A:ctor", "module:init", "A:init"])
    })

    it("does not remount after an unmount — the module is spent", () => {
        const log: string[] = []
        const service = tracked(log, "A")
        const module = makeApp({ providers: [service] })

        module.mount()
        module.unmount()
        module.mount()

        expect(service.counts).toEqual({ init: 1, mount: 1, unmount: 1, destroy: 0 })
    })

    it("ignores mount and unmount after destroy", async () => {
        const log: string[] = []
        const service = tracked(log, "A")
        const module = makeApp({ providers: [service] })
        module.mount()
        module.unmount()
        await module.destroy()
        log.length = 0

        module.mount()
        module.unmount()
        await module.destroy()

        expect(log).toEqual([])
        expect(service.counts).toEqual({ init: 1, mount: 1, unmount: 1, destroy: 1 })
    })

    it("skips the unmount phase entirely when destroy comes first", async () => {
        const log: string[] = []
        const service = tracked(log, "A")
        const module = makeApp({ providers: [service] })
        module.mount()

        await module.destroy()
        module.unmount()

        expect(service.counts).toEqual({ init: 1, mount: 1, unmount: 0, destroy: 1 })
    })
})

describe("concurrent signals", () => {
    it("collapses three overlapping destroy calls", async () => {
        const log: string[] = []
        const service = tracked(log, "A", { destroyDelay: 10 })
        const module = makeApp({ providers: [service] })
        module.mount()
        module.unmount()
        log.length = 0

        await Promise.all([module.destroy(), module.destroy(), module.destroy()])

        expect(service.counts.destroy).toBe(1)
        expect(log).toEqual(["A:destroy"])
    })

    it("collapses a second destroy issued while the first is still suspended", async () => {
        const log: string[] = []
        const service = tracked(log, "A", { destroyDelay: 20 })
        const module = makeApp({ providers: [service] })
        module.mount()
        module.unmount()
        log.length = 0

        const inFlight = module.destroy()
        await new Promise((resolve) => setTimeout(resolve, 5))
        await module.destroy()
        expect(log).toEqual([])

        await inFlight
        expect(log).toEqual(["A:destroy"])
        expect(service.counts.destroy).toBe(1)
    })

    it("destroys each provider once when parent and child are destroyed together", async () => {
        const log: string[] = []
        const parentService = tracked(log, "P")
        const childService = tracked(log, "C")
        const parent = makeApp({ providers: [parentService] })
        const child = makeChild(parent, { providers: [childService] })
        child.mount()
        parent.mount()
        parent.unmount()
        log.length = 0

        await Promise.all([parent.destroy(), child.destroy()])

        expect(log).toEqual(["C:destroy", "P:destroy"])
        expect(parentService.counts.destroy).toBe(1)
        expect(childService.counts.destroy).toBe(1)
    })

    it("destroys each provider once when the child claims itself first", async () => {
        const log: string[] = []
        const parentService = tracked(log, "P")
        const childService = tracked(log, "C")
        const parent = makeApp({ providers: [parentService] })
        const child = makeChild(parent, { providers: [childService] })
        child.mount()
        parent.mount()
        parent.unmount()
        log.length = 0

        await Promise.all([child.destroy(), parent.destroy()])

        expect(parentService.counts.destroy).toBe(1)
        expect(childService.counts.destroy).toBe(1)
        expect(log.slice().sort()).toEqual(["C:destroy", "P:destroy"])
    })

    it("collapses repeated unmount signals arriving from both ends of the tree", () => {
        const log: string[] = []
        const parentService = tracked(log, "P")
        const childService = tracked(log, "C")
        const parent = makeApp({ providers: [parentService] })
        const child = makeChild(parent, { providers: [childService] })
        child.mount()
        parent.mount()
        log.length = 0

        child.unmount()
        parent.unmount()
        child.unmount()

        expect(log).toEqual(["C:unmount", "P:unmount"])
        expect(parentService.counts.unmount).toBe(1)
        expect(childService.counts.unmount).toBe(1)
    })
})
