import { describe, expect, it } from "vitest"

import { Container, Inject, Injectable, Scope, decorate } from "../../src/container/index.js"
import type { Constructor } from "../../src/container/index.js"
import type { Provider } from "../../src/container/index.js"
import { makeApp, tracked } from "../setup/helpers.js"

// onResolution — the hook the module lifecycle is built on.
// ========================================
//
// It reports instances at construction time, on the container that owns the binding. Everything the
// lifecycle knows about "what belongs to this module" comes from here.

function injectableClass<T extends Constructor>(target: T): T {
    decorate(Injectable(), target)
    return target
}

function injectParam(target: Constructor, token: Parameters<typeof Inject>[0], index: number): void {
    decorate(Inject(token) as ParameterDecorator, target, index)
}

describe("onResolution", () => {
    it("fires once per constructed singleton, however often it is resolved", () => {
        class Service {}
        injectableClass(Service)
        const seen: unknown[] = []

        const container = new Container()
        container.register(Service)
        container.onResolution(Service, (instance) => seen.push(instance))

        const first = container.resolve(Service)
        container.resolve(Service)
        container.resolve(Service)

        expect(seen).toEqual([first])
    })

    it("fires for a useValue binding on first resolve only", () => {
        const value = { kind: "constant" }
        const TOKEN = Symbol("constant")
        const seen: unknown[] = []

        const container = new Container()
        container.register({ provide: TOKEN, useValue: value })
        container.onResolution(TOKEN, (instance) => seen.push(instance))

        container.resolve(TOKEN)
        container.resolve(TOKEN)

        expect(seen).toEqual([value])
    })

    it("fires for a useFactory binding", () => {
        const TOKEN = Symbol("factory")
        const seen: unknown[] = []

        const container = new Container()
        container.register({ provide: TOKEN, useFactory: () => ({ built: true }) })
        container.onResolution(TOKEN, (instance) => seen.push(instance))

        const resolved = container.resolve(TOKEN)
        container.resolve(TOKEN)

        expect(seen).toEqual([resolved])
    })

    it("does not fire until something resolves the token", () => {
        class Service {}
        injectableClass(Service)
        const seen: unknown[] = []

        const container = new Container()
        container.register(Service)
        container.onResolution(Service, (instance) => seen.push(instance))

        expect(seen).toEqual([])
    })

    it("fires on the owning container when a descendant resolves the binding", () => {
        class Service {}
        injectableClass(Service)
        const seen: string[] = []

        const owner = new Container()
        owner.register(Service)
        owner.onResolution(Service, () => seen.push("owner"))

        const grandchild = owner.fork().fork()
        const resolved = grandchild.resolve(Service)

        expect(seen).toEqual(["owner"])
        expect(resolved).toBe(owner.resolve(Service))
        // Still once — the second resolve above hits the cached singleton.
        expect(seen).toEqual(["owner"])
    })

    it("reports a dependency before the instance that injected it", () => {
        const B = Symbol("B")
        class Dependency {}
        injectableClass(Dependency)
        class Dependent {
            constructor(readonly dependency: unknown) {}
        }
        injectableClass(Dependent)
        injectParam(Dependent, B, 0)

        const order: string[] = []
        const container = new Container()
        container.register([{ provide: B, useClass: Dependency }, Dependent])
        container.onResolution(Dependent, () => order.push("Dependent"))
        container.onResolution(B, () => order.push("Dependency"))

        container.resolve(Dependent)

        expect(order).toEqual(["Dependency", "Dependent"])
    })

    it("fires per instance for a transient binding", () => {
        class Service {}
        injectableClass(Service)
        const TOKEN = Symbol("transient")
        const seen: unknown[] = []

        const container = new Container()
        container.register({ provide: TOKEN, useClass: Service, scope: Scope.Transient })
        container.onResolution(TOKEN, (instance) => seen.push(instance))

        const first = container.resolve(TOKEN)
        const second = container.resolve(TOKEN)
        const third = container.resolve(TOKEN)

        expect(seen).toEqual([first, second, third])
        expect(new Set(seen).size).toBe(3)
    })

    it("fires the target's listener when an alias is resolved, and refuses to observe the alias", () => {
        class Service {}
        injectableClass(Service)
        const ALIAS = Symbol("alias")
        const seen: string[] = []

        const container = new Container()
        container.register([Service, { provide: ALIAS, useExisting: Service }])
        container.onResolution(Service, () => seen.push("target"))

        // An alias owns no binding and constructs nothing, so there is nothing to observe on it.
        expect(() => container.onResolution(ALIAS, () => seen.push("alias"))).toThrowError(
            /Cannot observe alias/
        )

        container.resolve(ALIAS)

        expect(seen).toEqual(["target"])
    })

    it("reports the same instance the caller receives", () => {
        class Service {
            readonly id = "service"
        }
        injectableClass(Service)
        let reported: Service | undefined

        const container = new Container()
        container.register(Service)
        container.onResolution<Service>(Service, (instance) => {
            reported = instance
        })

        expect(container.resolve(Service)).toBe(reported)
    })

    it("refuses to observe a token the container does not own", () => {
        const TOKEN = Symbol("upward")

        const parent = new Container()
        parent.register({ provide: TOKEN, useValue: { from: "parent" } })
        const child = parent.fork()

        // The child can resolve it through the chain but owns no binding for it, so it cannot observe it.
        expect(child.resolve(TOKEN)).toEqual({ from: "parent" })
        expect(() => child.onResolution(TOKEN, () => {})).toThrowError(/nothing is registered for it/)
    })

    /**
     * Listeners ride on the BINDING, not on the container. A descendant that shadows a token owns a
     * different binding, so the ancestor's listener never fires for it: each container hears only about
     * instances its own binding produced, whichever container the resolution was requested from.
     *
     * That is what makes shadowing safe for the lifecycle. A container-level listener would be inherited
     * downward and matched by token, so a module shadowing an ancestor's token would get its instance
     * adopted by the ancestor's lifecycle too — destroyed on the ancestor's schedule, not its own.
     */
    it("does not fire an ancestor's listener for a shadowing binding resolved below it", () => {
        const TOKEN = Symbol("shadowed")
        const parentValue = { from: "parent" }
        const childValue = { from: "child" }
        const parentSeen: unknown[] = []
        const childSeen: unknown[] = []

        const parent = new Container()
        parent.register({ provide: TOKEN, useValue: parentValue })
        parent.onResolution(TOKEN, (instance) => parentSeen.push(instance))

        const child = parent.fork()
        child.register({ provide: TOKEN, useValue: childValue })
        child.onResolution(TOKEN, (instance) => childSeen.push(instance))

        child.resolve(TOKEN)

        // Listeners ride on the binding, so the ancestor never sees an instance it does not own.
        expect(childSeen).toEqual([childValue])
        expect(parentSeen).toEqual([])

        parent.resolve(TOKEN)
        expect(parentSeen).toEqual([parentValue])
        expect(childSeen).toEqual([childValue])
    })
})

// Multicast — observing never displaces
// ========================================
//
// Inversify's `onActivation` REPLACES a binding's handler rather than chaining it (measured in
// scratch/probe-multiprovider-7-double-activation.ts). The container wraps that: one real handler per
// binding, dispatching to a list of listeners. Everything below is that wrapper's contract.

describe("multicast", () => {
    it("lets user code observe a module-owned token WITHOUT unhooking the module's adoption", async () => {
        // THE regression test. A module observes its own providers during init to adopt them. Before the
        // wrapper, any later `onResolution` on one of those tokens replaced the module's listener and the
        // service silently stopped receiving its lifecycle — a bug with no error and no failing assertion
        // anywhere near the cause. If this test ever goes away, that trap comes back.
        const log: string[] = []
        const Service = tracked(log, "S")
        const TOKEN = Symbol("module-owned")

        const module = makeApp({ providers: [{ provide: TOKEN, useClass: Service, lazy: true } as Provider] })
        module.mount()

        // User code, well after the module armed its own observation during init.
        const seen: unknown[] = []
        module.container.onResolution(TOKEN, (instance) => seen.push(instance))

        const instance = module.container.resolve(TOKEN)

        // The user's listener fired...
        expect(seen).toEqual([instance])

        // ...and the module still adopted it — init on arrival (mount has already gone past, per the
        // late-adoption rule), then the rest of the lifecycle.
        module.unmount()
        await module.destroy()

        expect(Service.counts).toEqual({ init: 1, mount: 0, unmount: 1, destroy: 1 })
        expect(log).toEqual(["S:ctor", "S:init", "S:unmount", "S:destroy"])
    })

    it("survives the eager path too — observation added after a module already built its instance", async () => {
        const log: string[] = []
        const Service = tracked(log, "S")
        const TOKEN = Symbol("module-owned-eager")

        const module = makeApp({ providers: [{ provide: TOKEN, useClass: Service } as Provider] })
        module.mount()

        // The instance already exists, so nothing fires for this listener — but attaching it must not
        // disturb the adoption that already happened either.
        const seen: unknown[] = []
        module.container.onResolution(TOKEN, (instance) => seen.push(instance))
        module.container.resolve(TOKEN)

        expect(seen).toEqual([])

        module.unmount()
        await module.destroy()

        expect(Service.counts).toEqual({ init: 1, mount: 1, unmount: 1, destroy: 1 })
    })

    it("notifies observers in attach order", () => {
        const order: string[] = []
        const TOKEN = Symbol("ordered")

        const container = new Container()
        container.register({ provide: TOKEN, useValue: "v" })
        container.onResolution(TOKEN, () => order.push("first"))
        container.onResolution(TOKEN, () => order.push("second"))
        container.onResolution(TOKEN, () => order.push("third"))

        container.resolve(TOKEN)

        expect(order).toEqual(["first", "second", "third"])
    })

    it("does not drag a listener attached mid-notification into the walk that is already running", () => {
        const order: string[] = []
        const TOKEN = Symbol("reentrant")

        class Service {}
        injectableClass(Service)

        const container = new Container()
        container.register({ provide: TOKEN, useClass: Service, scope: Scope.Transient })
        container.onResolution(TOKEN, () => {
            order.push("first")
            container.onResolution(TOKEN, () => order.push("late"))
        })

        container.resolve(TOKEN)
        expect(order).toEqual(["first"])

        // It joins for the next construction, which for a transient is the very next read.
        order.length = 0
        container.resolve(TOKEN)
        expect(order).toEqual(["first", "late"])
    })
})
