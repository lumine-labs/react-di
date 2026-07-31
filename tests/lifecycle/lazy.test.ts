import { describe, expect, it } from "vitest"

import { Scope } from "../../src/container/index.js"
import type { Provider } from "../../src/container/index.js"
import { makeApp, makeChild, phase, tracked } from "../setup/helpers.js"

// lazy providers.
// ========================================
//
// `lazy` skips the owner's eager pass: nothing is built until somebody resolves the token. Whoever
// resolves it, the instance joins the module that DECLARED it, and it catches up with `onModuleInit`
// alone — mount is a tree event that has already gone past.

describe("lazy", () => {
    it("is not built at init or at mount, and joins on first resolve", async () => {
        const log: string[] = []
        const service = tracked(log, "L")
        const module = makeApp({
            providers: [{ provide: service, useClass: service, lazy: true } as Provider],
        })

        expect(log).toEqual([])

        module.mount()
        expect(log).toEqual([])

        module.container.resolve(service as never)
        expect(log).toEqual(["L:ctor", "L:init"])
        expect(service.counts.mount).toBe(0)

        module.unmount()
        expect(phase(log, "unmount")).toEqual(["L:unmount"])

        await module.destroy()
        expect(service.counts).toEqual({ init: 1, mount: 0, unmount: 1, destroy: 1 })
    })

    it("joins once however often it is resolved", async () => {
        const log: string[] = []
        const service = tracked(log, "L")
        const module = makeApp({
            providers: [{ provide: service, useClass: service, lazy: true } as Provider],
        })
        module.mount()

        const first = module.container.resolve(service as never)
        const second = module.container.resolve(service as never)
        expect(second).toBe(first)

        module.unmount()
        await module.destroy()

        expect(service.counts).toEqual({ init: 1, mount: 0, unmount: 1, destroy: 1 })
    })

    it("works for a lazy factory provider too", async () => {
        const log: string[] = []
        const TOKEN = Symbol("lazy-factory")
        const module = makeApp({
            providers: [
                {
                    provide: TOKEN,
                    lazy: true,
                    useFactory: () => {
                        log.push("F:ctor")
                        return {
                            onModuleInit: () => log.push("F:init"),
                            onModuleMount: () => log.push("F:mount"),
                            onModuleUnmount: () => log.push("F:unmount"),
                            onModuleDestroy: () => log.push("F:destroy"),
                        }
                    },
                },
            ],
        })
        module.mount()
        expect(log).toEqual([])

        module.container.resolve(TOKEN)
        expect(log).toEqual(["F:ctor", "F:init"])

        module.unmount()
        await module.destroy()
        expect(log).toEqual(["F:ctor", "F:init", "F:unmount", "F:destroy"])
    })

    it("stays out of the lifecycle entirely when it is also transient", async () => {
        const log: string[] = []
        const service = tracked(log, "T")
        const TOKEN = Symbol("lazy-transient")
        const module = makeApp({
            providers: [{ provide: TOKEN, useClass: service, scope: Scope.Transient, lazy: true } as Provider],
        })
        module.mount()
        module.container.resolve(TOKEN)

        module.unmount()
        await module.destroy()

        expect(service.counts).toEqual({ init: 0, mount: 0, unmount: 0, destroy: 0 })
        expect(log).toEqual(["T:ctor"])
    })

    it("joins the declaring module when a descendant resolves it", async () => {
        const log: string[] = []
        const service = tracked(log, "L")
        const parent = makeApp({
            providers: [{ provide: service, useClass: service, lazy: true } as Provider],
        })
        const child = makeChild(parent, { providers: [] })
        parent.mount()
        child.mount()

        child.container.resolve(service as never)
        expect(log).toEqual(["L:ctor", "L:init"])

        // The resolver's own module tears down; the instance belongs to the declaring module and survives.
        child.unmount()
        await child.destroy()
        expect(service.counts).toEqual({ init: 1, mount: 0, unmount: 0, destroy: 0 })

        parent.unmount()
        await parent.destroy()
        expect(service.counts).toEqual({ init: 1, mount: 0, unmount: 1, destroy: 1 })
    })

    it("survives a grandchild's teardown too", async () => {
        const log: string[] = []
        const service = tracked(log, "L")
        const root = makeApp({
            providers: [{ provide: service, useClass: service, lazy: true } as Provider],
        })
        const middle = makeChild(root, { providers: [] })
        const leaf = makeChild(middle, { providers: [] })
        root.mount()
        middle.mount()
        leaf.mount()

        leaf.container.resolve(service as never)
        expect(service.counts.init).toBe(1)

        middle.unmount()
        await middle.destroy()
        expect(service.counts).toEqual({ init: 1, mount: 0, unmount: 0, destroy: 0 })

        root.unmount()
        await root.destroy()
        expect(service.counts).toEqual({ init: 1, mount: 0, unmount: 1, destroy: 1 })
    })

    it("still joins when resolved after the module unmounted", async () => {
        const log: string[] = []
        const service = tracked(log, "L")
        const module = makeApp({
            providers: [{ provide: service, useClass: service, lazy: true } as Provider],
        })
        module.mount()
        module.unmount()

        module.container.resolve(service as never)
        expect(log).toEqual(["L:ctor", "L:init"])

        await module.destroy()
        expect(service.counts).toEqual({ init: 1, mount: 0, unmount: 0, destroy: 1 })
    })

    it("is not adopted at all once the module is destroyed", async () => {
        const log: string[] = []
        const service = tracked(log, "L")
        const module = makeApp({
            providers: [{ provide: service, useClass: service, lazy: true } as Provider],
        })
        module.mount()
        module.unmount()
        await module.destroy()

        module.container.resolve(service as never)

        expect(log).toEqual(["L:ctor"])
        expect(service.counts).toEqual({ init: 0, mount: 0, unmount: 0, destroy: 0 })
    })

    it("behaves identically declared as `{ useClass: X, lazy: true }`", async () => {
        const log: string[] = []
        const service = tracked(log, "L")
        const module = makeApp({ providers: [{ useClass: service, lazy: true } as Provider] })

        expect(log).toEqual([])

        module.mount()
        expect(log).toEqual([])

        module.container.resolve(service as never)
        expect(log).toEqual(["L:ctor", "L:init"])
        expect(service.counts.mount).toBe(0)

        module.unmount()
        expect(phase(log, "unmount")).toEqual(["L:unmount"])

        await module.destroy()
        expect(service.counts).toEqual({ init: 1, mount: 0, unmount: 1, destroy: 1 })
    })

    it("stays out of the lifecycle when `{ useClass: X }` is also transient", async () => {
        const log: string[] = []
        const service = tracked(log, "T")
        const module = makeApp({ providers: [{ useClass: service, scope: Scope.Transient, lazy: true } as Provider] })
        module.mount()
        module.container.resolve(service as never)

        module.unmount()
        await module.destroy()

        expect(service.counts).toEqual({ init: 0, mount: 0, unmount: 0, destroy: 0 })
        expect(log).toEqual(["T:ctor"])
    })

    it("does not delay an eager sibling", () => {
        const log: string[] = []
        const eager = tracked(log, "E")
        const lazy = tracked(log, "L")
        makeApp({
            providers: [{ provide: lazy, useClass: lazy, lazy: true } as Provider, eager],
        })

        expect(log).toEqual(["E:ctor", "E:init"])
    })
})
