import { describe, expect, it } from "vitest"

import type { Container } from "../../src/container/index.js"
import { createModuleResolution } from "../../src/core/module/resolution.js"
import { ModuleLifecycle } from "../../src/core/providers/module-lifecycle/module-lifecycle.provider.js"
import { tracked } from "../setup/helpers.js"

// Idempotence.
// ========================================
//
// React re-sends signals; the orchestrator collapses them. Every hook runs exactly once per instance,
// whether the repeats are sequential or concurrent.

const lifecycleOf = (container: Container): ModuleLifecycle => container.resolve(ModuleLifecycle)

describe("repeated signals", () => {
    it("collapses repeats of every phase into one of each", async () => {
        const log: string[] = []
        const service = tracked(log, "A")
        const childService = tracked(log, "C")
        const parent = createModuleResolution(null, { root: true, providers: [service] })
        const child = createModuleResolution(parent.container, { providers: [childService] })

        lifecycleOf(parent.container).mount()
        lifecycleOf(parent.container).mount()
        lifecycleOf(child.container).mount()
        lifecycleOf(child.container).mount()

        lifecycleOf(parent.container).unmount()
        lifecycleOf(parent.container).unmount()
        lifecycleOf(child.container).unmount()

        await lifecycleOf(parent.container).destroy()
        await lifecycleOf(child.container).destroy()
        await lifecycleOf(parent.container).destroy()

        expect(service.counts).toEqual({ init: 1, mount: 1, unmount: 1, destroy: 1 })
        expect(childService.counts).toEqual({ init: 1, mount: 1, unmount: 1, destroy: 1 })
    })

    it("ignores a second init", () => {
        const log: string[] = []
        const service = tracked(log, "A")
        const module = createModuleResolution(null, { root: true, providers: [service] })

        lifecycleOf(module.container).init()
        lifecycleOf(module.container).init({ onModuleInit: () => log.push("module:init") })

        expect(service.counts.init).toBe(1)
        expect(log).toEqual(["A:ctor", "A:init"])
    })

    it("does not remount after an unmount — the module is spent", () => {
        const log: string[] = []
        const service = tracked(log, "A")
        const module = createModuleResolution(null, { root: true, providers: [service] })

        lifecycleOf(module.container).mount()
        lifecycleOf(module.container).unmount()
        lifecycleOf(module.container).mount()

        expect(service.counts).toEqual({ init: 1, mount: 1, unmount: 1, destroy: 0 })
    })

    it("ignores mount and unmount after destroy", async () => {
        const log: string[] = []
        const service = tracked(log, "A")
        const module = createModuleResolution(null, { root: true, providers: [service] })
        lifecycleOf(module.container).mount()
        lifecycleOf(module.container).unmount()
        await lifecycleOf(module.container).destroy()
        log.length = 0

        lifecycleOf(module.container).mount()
        lifecycleOf(module.container).unmount()
        await lifecycleOf(module.container).destroy()

        expect(log).toEqual([])
        expect(service.counts).toEqual({ init: 1, mount: 1, unmount: 1, destroy: 1 })
    })

    it("skips the unmount phase entirely when destroy comes first", async () => {
        const log: string[] = []
        const service = tracked(log, "A")
        const module = createModuleResolution(null, { root: true, providers: [service] })
        lifecycleOf(module.container).mount()

        await lifecycleOf(module.container).destroy()
        lifecycleOf(module.container).unmount()

        expect(service.counts).toEqual({ init: 1, mount: 1, unmount: 0, destroy: 1 })
    })
})

describe("concurrent signals", () => {
    it("collapses three overlapping destroy calls", async () => {
        const log: string[] = []
        const service = tracked(log, "A", { destroyDelay: 10 })
        const module = createModuleResolution(null, { root: true, providers: [service] })
        lifecycleOf(module.container).mount()
        lifecycleOf(module.container).unmount()
        log.length = 0

        await Promise.all([
            lifecycleOf(module.container).destroy(),
            lifecycleOf(module.container).destroy(),
            lifecycleOf(module.container).destroy(),
        ])

        expect(service.counts.destroy).toBe(1)
        expect(log).toEqual(["A:destroy"])
    })

    it("collapses a second destroy issued while the first is still suspended", async () => {
        const log: string[] = []
        const service = tracked(log, "A", { destroyDelay: 20 })
        const module = createModuleResolution(null, { root: true, providers: [service] })
        lifecycleOf(module.container).mount()
        lifecycleOf(module.container).unmount()
        log.length = 0

        const inFlight = lifecycleOf(module.container).destroy()
        await new Promise((resolve) => setTimeout(resolve, 5))
        await lifecycleOf(module.container).destroy()
        expect(log).toEqual([])

        await inFlight
        expect(log).toEqual(["A:destroy"])
        expect(service.counts.destroy).toBe(1)
    })

    it("destroys each provider once when parent and child are destroyed together", async () => {
        const log: string[] = []
        const parentService = tracked(log, "P")
        const childService = tracked(log, "C")
        const parent = createModuleResolution(null, { root: true, providers: [parentService] })
        const child = createModuleResolution(parent.container, { providers: [childService] })
        lifecycleOf(child.container).mount()
        lifecycleOf(parent.container).mount()
        lifecycleOf(parent.container).unmount()
        log.length = 0

        await Promise.all([lifecycleOf(parent.container).destroy(), lifecycleOf(child.container).destroy()])

        expect(log).toEqual(["C:destroy", "P:destroy"])
        expect(parentService.counts.destroy).toBe(1)
        expect(childService.counts.destroy).toBe(1)
    })

    it("destroys each provider once when the child claims itself first", async () => {
        const log: string[] = []
        const parentService = tracked(log, "P")
        const childService = tracked(log, "C")
        const parent = createModuleResolution(null, { root: true, providers: [parentService] })
        const child = createModuleResolution(parent.container, { providers: [childService] })
        lifecycleOf(child.container).mount()
        lifecycleOf(parent.container).mount()
        lifecycleOf(parent.container).unmount()
        log.length = 0

        await Promise.all([lifecycleOf(child.container).destroy(), lifecycleOf(parent.container).destroy()])

        expect(parentService.counts.destroy).toBe(1)
        expect(childService.counts.destroy).toBe(1)
        expect(log.slice().sort()).toEqual(["C:destroy", "P:destroy"])
    })

    it("collapses repeated unmount signals arriving from both ends of the tree", () => {
        const log: string[] = []
        const parentService = tracked(log, "P")
        const childService = tracked(log, "C")
        const parent = createModuleResolution(null, { root: true, providers: [parentService] })
        const child = createModuleResolution(parent.container, { providers: [childService] })
        lifecycleOf(child.container).mount()
        lifecycleOf(parent.container).mount()
        log.length = 0

        lifecycleOf(child.container).unmount()
        lifecycleOf(parent.container).unmount()
        lifecycleOf(child.container).unmount()

        expect(log).toEqual(["C:unmount", "P:unmount"])
        expect(parentService.counts.unmount).toBe(1)
        expect(childService.counts.unmount).toBe(1)
    })
})
