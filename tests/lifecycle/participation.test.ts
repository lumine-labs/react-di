import { describe, expect, it } from "vitest"

import { Injectable, Scope, decorate } from "../../src/container/index.js"
import type { Container, Provider } from "../../src/container/index.js"
import { createModuleResolution } from "../../src/core/module/resolution.js"
import { ModuleLifecycle } from "../../src/core/providers/module-lifecycle/module-lifecycle.provider.js"
import type { HookCounts } from "../setup/helpers.js"
import { phase, plain, tracked } from "../setup/helpers.js"

// Who takes part in the lifecycle.
// ========================================
//
// One participant per constructed singleton instance of a provider this module declares. Transients are
// out by construction, aliases add no participant of their own, and the set is keyed by instance — the
// same object under two tokens is one participant.

const lifecycleOf = (container: Container): ModuleLifecycle => container.resolve(ModuleLifecycle)

const NOTHING: HookCounts = { init: 0, mount: 0, unmount: 0, destroy: 0 }
const ONCE: HookCounts = { init: 1, mount: 1, unmount: 1, destroy: 1 }

describe("participation", () => {
    it("never hands a hook to a transient, however often it is resolved", async () => {
        const log: string[] = []
        const service = tracked(log, "T")
        const TOKEN = Symbol("transient")
        const module = createModuleResolution(null, {
            root: true,
            providers: [{ provide: TOKEN, useClass: service, scope: Scope.Transient } as Provider],
        })

        lifecycleOf(module.container).mount()
        module.container.resolve(TOKEN)
        module.container.resolve(TOKEN)
        lifecycleOf(module.container).unmount()
        await lifecycleOf(module.container).destroy()

        expect(service.counts).toEqual(NOTHING)
        expect(phase(log, "ctor")).toEqual(["T:ctor", "T:ctor"])
    })

    it("does not build a transient eagerly at init", () => {
        const log: string[] = []
        const service = tracked(log, "T")
        const TOKEN = Symbol("transient-eager")
        createModuleResolution(null, {
            root: true,
            providers: [{ provide: TOKEN, useClass: service, scope: Scope.Transient } as Provider],
        })

        expect(log).toEqual([])
    })

    it("does not double-count a target that also has an alias", async () => {
        const log: string[] = []
        const service = tracked(log, "A")
        const ALIAS = Symbol("alias")
        const module = createModuleResolution(null, {
            root: true,
            providers: [service, { provide: ALIAS, useExisting: service } as Provider],
        })

        lifecycleOf(module.container).mount()
        module.container.resolve(ALIAS)
        module.container.resolve(ALIAS)
        lifecycleOf(module.container).unmount()
        await lifecycleOf(module.container).destroy()

        expect(service.counts).toEqual(ONCE)
        expect(log).toEqual(["A:ctor", "A:init", "A:mount", "A:unmount", "A:destroy"])
    })

    it("counts one object registered under two useValue tokens once", async () => {
        const counts: HookCounts = { init: 0, mount: 0, unmount: 0, destroy: 0 }
        const shared = {
            onModuleInit: () => counts.init++,
            onModuleMount: () => counts.mount++,
            onModuleUnmount: () => counts.unmount++,
            onModuleDestroy: () => counts.destroy++,
        }
        const FIRST = Symbol("first")
        const SECOND = Symbol("second")

        const module = createModuleResolution(null, {
            root: true,
            providers: [
                { provide: FIRST, useValue: shared },
                { provide: SECOND, useValue: shared },
            ],
        })

        lifecycleOf(module.container).mount()
        lifecycleOf(module.container).unmount()
        await lifecycleOf(module.container).destroy()

        expect(counts).toEqual(ONCE)
    })

    it("destroys a module that never mounted", async () => {
        const log: string[] = []
        const service = tracked(log, "A")
        const module = createModuleResolution(null, { root: true, providers: [service] })

        lifecycleOf(module.container).unmount()
        await lifecycleOf(module.container).destroy()

        expect(service.counts).toEqual({ init: 1, mount: 0, unmount: 0, destroy: 1 })
        expect(log).toEqual(["A:ctor", "A:init", "A:destroy"])
    })

    it("includes a factory-built instance", async () => {
        const log: string[] = []
        const TOKEN = Symbol("factory")
        const module = createModuleResolution(null, {
            root: true,
            providers: [
                {
                    provide: TOKEN,
                    useFactory: () => ({
                        onModuleInit: () => log.push("F:init"),
                        onModuleMount: () => log.push("F:mount"),
                        onModuleUnmount: () => log.push("F:unmount"),
                        onModuleDestroy: () => log.push("F:destroy"),
                    }),
                },
            ],
        })

        lifecycleOf(module.container).mount()
        lifecycleOf(module.container).unmount()
        await lifecycleOf(module.container).destroy()

        expect(log).toEqual(["F:init", "F:mount", "F:unmount", "F:destroy"])
    })

    it("includes an instance that implements only one of the four hooks", async () => {
        const log: string[] = []
        class DestroyOnly {
            onModuleDestroy(): void {
                log.push("D:destroy")
            }
        }
        decorate(Injectable(), DestroyOnly)

        const module = createModuleResolution(null, { root: true, providers: [DestroyOnly] })
        lifecycleOf(module.container).mount()
        lifecycleOf(module.container).unmount()
        await lifecycleOf(module.container).destroy()

        expect(log).toEqual(["D:destroy"])
    })

    it("skips a provider with no hooks without disturbing the order of the rest", async () => {
        const log: string[] = []
        const module = createModuleResolution(null, {
            root: true,
            providers: [tracked(log, "A"), plain("noop"), tracked(log, "B")],
        })
        log.length = 0

        lifecycleOf(module.container).mount()
        lifecycleOf(module.container).unmount()
        await lifecycleOf(module.container).destroy()

        expect(log).toEqual(["A:mount", "B:mount", "B:unmount", "A:unmount", "B:destroy", "A:destroy"])
    })

    it("leaves an ancestor's instance alone when a descendant resolves it", async () => {
        const log: string[] = []
        const service = tracked(log, "A")
        const parent = createModuleResolution(null, { root: true, providers: [service] })
        const child = createModuleResolution(parent.container, { providers: [] })
        lifecycleOf(child.container).mount()
        lifecycleOf(parent.container).mount()

        child.container.resolve(service as never)
        expect(service.counts).toEqual({ init: 1, mount: 1, unmount: 0, destroy: 0 })

        lifecycleOf(child.container).unmount()
        await lifecycleOf(child.container).destroy()

        expect(service.counts).toEqual({ init: 1, mount: 1, unmount: 0, destroy: 0 })

        lifecycleOf(parent.container).unmount()
        await lifecycleOf(parent.container).destroy()
        expect(service.counts).toEqual(ONCE)
    })

    /**
     * Characterisation, not endorsement: `metadata.children` is populated by `mount()`, so a module that
     * was created but never mounted is invisible to its parent's cascade and its providers are never
     * destroyed. React always commits, so this is only reachable when a module is built and then dropped
     * before its effect runs.
     */
    it("does not reach a child that never mounted", async () => {
        const log: string[] = []
        const childService = tracked(log, "C")
        const parent = createModuleResolution(null, { root: true, providers: [tracked(log, "P")] })
        createModuleResolution(parent.container, { providers: [childService] })

        lifecycleOf(parent.container).mount()
        lifecycleOf(parent.container).unmount()
        await lifecycleOf(parent.container).destroy()

        expect(childService.counts).toEqual({ init: 1, mount: 0, unmount: 0, destroy: 0 })
        expect(log).toEqual(["P:ctor", "P:init", "C:ctor", "C:init", "P:mount", "P:unmount", "P:destroy"])
    })

    /**
     * SOURCE BUG, left unfixed on purpose — the deliverable here is tests.
     *
     * Inversify activation listeners are inherited downward and matched by token, not by binding (pinned
     * in tests/container/observation.test.ts). When a child module declares a token an ancestor module
     * also declares, the ancestor's `onResolution` listener fires for the *child's* instance, so
     * `ModuleLifecycle#collectInstances` adopts it into the ancestor's participant set as well. The
     * instance then receives all four hooks twice — once from each module — and the ancestor keeps a
     * reference to an object it does not own.
     *
     * Marked `it.fails` so the correct expectation stays on record: once the listener checks ownership,
     * this starts passing and vitest will demand the marker be dropped.
     */
    it("runs each hook once when a child module shadows an ancestor's token", async () => {
        const log: string[] = []
        const TOKEN = Symbol("shadowed")
        const parentService = tracked(log, "P")
        const childService = tracked(log, "C")

        const parent = createModuleResolution(null, {
            root: true,
            providers: [{ provide: TOKEN, useClass: parentService } as Provider],
        })
        const child = createModuleResolution(parent.container, {
            providers: [{ provide: TOKEN, useClass: childService } as Provider],
        })

        lifecycleOf(child.container).mount()
        lifecycleOf(parent.container).mount()
        lifecycleOf(parent.container).unmount()
        await lifecycleOf(parent.container).destroy()

        expect(parentService.counts).toEqual(ONCE)
        expect(childService.counts).toEqual(ONCE)
    })
})
