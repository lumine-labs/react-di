import { describe, expect, it } from "vitest"

import { Container, InjectAll, Injectable, ResolveAllMode, Scope, decorate } from "../../src/container/index.js"
import type { ClassProvider, Constructor, FactoryDependency } from "../../src/container/index.js"
import { Resolver } from "../../src/core/providers/resolver/resolver.provider.js"

// Multi-providers.
// ========================================
//
// `multi: true` turns a token from one registration into a collection several providers contribute to.
// The whole contract rests on one property: MODE IS CHAIN-WIDE. A token is a single registration or a
// collection, and it is that for every container in the chain — registration refuses to mix. That is what
// lets `resolve` and `resolveAll` decide from the nearest declared mode alone, and it is why every
// diagonal cell of the matrix below throws at registration rather than at the read.

function injectableClass<T extends Constructor>(target: T): T {
    decorate(Injectable(), target)
    return target
}

const TOKEN = Symbol("PLUGINS")

describe("registration matrix — same container", () => {
    it("single then single: rejected, as before", () => {
        const container = new Container()
        container.register({ provide: TOKEN, useValue: "a" })

        expect(() => container.register({ provide: TOKEN, useValue: "b" })).toThrow(
            "Token PLUGINS is already registered on this container."
        )
    })

    it("multi then multi: appended", () => {
        const container = new Container()
        container.register({ provide: TOKEN, useValue: "a", multi: true })
        container.register({ provide: TOKEN, useValue: "b", multi: true })
        container.register({ provide: TOKEN, useValue: "c", multi: true })

        expect(container.resolveAll(TOKEN)).toEqual(["a", "b", "c"])
    })

    it("multi: false claims the token exactly as omitting multi does", () => {
        class Service {}
        injectableClass(Service)

        const container = new Container()
        container.register({ provide: TOKEN, useClass: Service, multi: false })

        expect(container.resolve(TOKEN)).toBeInstanceOf(Service)
        expect(() => container.register({ provide: TOKEN, useValue: "b", multi: true })).toThrow(
            "Token PLUGINS is already a single registration on this container, and this provider registers it as a multi-provider collection."
        )
    })

    it("single then multi: rejected, naming both registrations", () => {
        const container = new Container()
        container.register({ provide: TOKEN, useValue: "a" })

        expect(() => container.register({ provide: TOKEN, useValue: "b", multi: true })).toThrow(
            "Token PLUGINS is already a single registration on this container, and this provider registers it as a multi-provider collection."
        )
    })

    it("multi then single: rejected, naming both registrations", () => {
        const container = new Container()
        container.register({ provide: TOKEN, useValue: "a", multi: true })

        expect(() => container.register({ provide: TOKEN, useValue: "b" })).toThrow(
            "Token PLUGINS is already a multi-provider collection on this container, and this provider registers it as a single registration."
        )
    })

    it("points at the fix in either direction", () => {
        const single = new Container()
        single.register({ provide: TOKEN, useValue: "a" })
        expect(() => single.register({ provide: TOKEN, useValue: "b", multi: true })).toThrow(
            "Drop `multi: true` here, or add it to the other registration."
        )

        const multi = new Container()
        multi.register({ provide: TOKEN, useValue: "a", multi: true })
        expect(() => multi.register({ provide: TOKEN, useValue: "b" })).toThrow(
            "Add `multi: true` here, or drop it from the other registration."
        )
    })

    it("rejects the mix whichever provider form carries it", () => {
        class Service {}
        injectableClass(Service)

        const container = new Container()
        container.register({ provide: TOKEN, useClass: Service, multi: true })

        expect(() => container.register({ provide: TOKEN, useFactory: () => "b" })).toThrow(
            "is already a multi-provider collection"
        )
        expect(() => container.register({ provide: TOKEN, useValue: "b" })).toThrow(
            "is already a multi-provider collection"
        )
    })
})

describe("registration matrix — across the chain", () => {
    it("single then single: allowed, the child shadows the parent", () => {
        const parent = new Container()
        parent.register({ provide: TOKEN, useValue: "parent" })
        const child = parent.fork()
        child.register({ provide: TOKEN, useValue: "child" })

        expect(child.resolve(TOKEN)).toBe("child")
        expect(parent.resolve(TOKEN)).toBe("parent")
    })

    it("multi then multi: allowed, the child contributes to the chain's collection", () => {
        const parent = new Container()
        parent.register({ provide: TOKEN, useValue: "parent", multi: true })
        const child = parent.fork()
        child.register({ provide: TOKEN, useValue: "child", multi: true })

        expect(child.resolveAll(TOKEN)).toEqual(["child", "parent"])
        expect(parent.resolveAll(TOKEN)).toEqual(["parent"])
    })

    it("single in the parent then multi in the child: rejected at the child's registration", () => {
        const parent = new Container()
        parent.register({ provide: TOKEN, useValue: "parent" })
        const child = parent.fork()

        expect(() => child.register({ provide: TOKEN, useValue: "child", multi: true })).toThrow(
            "Token PLUGINS is already a single registration on an ancestor container, and this provider registers it as a multi-provider collection."
        )
    })

    it("multi in the parent then single in the child: rejected at the child's registration", () => {
        const parent = new Container()
        parent.register({ provide: TOKEN, useValue: "parent", multi: true })
        const child = parent.fork()

        expect(() => child.register({ provide: TOKEN, useValue: "child" })).toThrow(
            "Token PLUGINS is already a multi-provider collection on an ancestor container, and this provider registers it as a single registration."
        )
    })

    it("looks past a container that declares nothing", () => {
        const root = new Container()
        root.register({ provide: TOKEN, useValue: "root", multi: true })
        const middle = root.fork()
        const leaf = middle.fork()

        expect(() => leaf.register({ provide: TOKEN, useValue: "leaf" })).toThrow(
            "already a multi-provider collection on an ancestor container"
        )
    })

    it("only the first own registration consults the chain — later members just append", () => {
        const root = new Container()
        root.register({ provide: TOKEN, useValue: "root", multi: true })
        const leaf = root.fork()
        leaf.register({ provide: TOKEN, useValue: "leaf-1", multi: true })
        leaf.register({ provide: TOKEN, useValue: "leaf-2", multi: true })

        expect(leaf.resolveAll(TOKEN)).toEqual(["leaf-1", "leaf-2", "root"])
    })
})

describe("resolve guards", () => {
    function multiContainer(): Container {
        const container = new Container()
        container.register({ provide: TOKEN, useValue: "a", multi: true })
        container.register({ provide: TOKEN, useValue: "b", multi: true })
        return container
    }

    it("resolve refuses a collection", () => {
        expect(() => multiContainer().resolve(TOKEN)).toThrow(
            "Token PLUGINS is a multi-provider collection — several providers contribute to it, so there is no single value to read. Use `resolveAll`."
        )
    })

    it("resolveOptional refuses a collection rather than reporting absence", () => {
        // Misuse, not a miss: `undefined` here would read as "nothing registered", which is a lie.
        expect(() => multiContainer().resolveOptional(TOKEN)).toThrow("Use `resolveAll`.")
    })

    it("resolveOr refuses a collection rather than falling back", () => {
        expect(() => multiContainer().resolveOr(TOKEN, "fallback")).toThrow("Use `resolveAll`.")
        expect(() => multiContainer().resolveOr(TOKEN, () => "fallback")).toThrow("Use `resolveAll`.")
    })

    it("refuses a collection contributed entirely by an ancestor", () => {
        const child = multiContainer().fork()

        expect(() => child.resolve(TOKEN)).toThrow("Use `resolveAll`.")
        expect(() => child.resolveOptional(TOKEN)).toThrow("Use `resolveAll`.")
        expect(() => child.resolveOr(TOKEN, "fallback")).toThrow("Use `resolveAll`.")
    })

    it("refuses a collection of exactly one member", () => {
        // The guard is about the MODE, not the count: a collection that happens to have one contribution
        // today is still a collection, and code reading it with `resolve` breaks on the second plugin.
        const container = new Container()
        container.register({ provide: TOKEN, useValue: "only", multi: true })

        expect(() => container.resolve(TOKEN)).toThrow("Use `resolveAll`.")
        expect(container.resolveAll(TOKEN)).toEqual(["only"])
    })

    it("resolveAll refuses a single registration", () => {
        const container = new Container()
        container.register({ provide: TOKEN, useValue: "only" })

        expect(() => container.resolveAll(TOKEN)).toThrow(
            "Token PLUGINS is a single registration, not a multi-provider collection — `resolveAll` would hide that behind a one-element array. Use `resolve`, or mark every provider for it `multi: true`."
        )
    })

    it("resolveAll refuses a single registration inherited from an ancestor", () => {
        const container = new Container()
        container.register({ provide: TOKEN, useValue: "only" })

        expect(() => container.fork().resolveAll(TOKEN)).toThrow("Use `resolve`")
    })

    it("resolveAll on a completely unregistered token stays []", () => {
        // The optional-contribution pattern: a collection point nobody filled is empty, not a mistake.
        const root = new Container()
        const child = root.fork()

        expect(root.resolveAll(TOKEN)).toEqual([])
        expect(child.resolveAll(TOKEN)).toEqual([])
        expect(child.resolveAll(TOKEN, "nearest")).toEqual([])
        expect(child.resolveAll(TOKEN, "self")).toEqual([])
    })
})

describe("aliases", () => {
    class Legacy {
        readonly name = "legacy"
    }
    class Direct {
        readonly name = "direct"
    }

    it("may BE a collection member, contributing the target's instance", () => {
        injectableClass(Legacy)
        injectableClass(Direct)

        const container = new Container()
        container.register(Legacy)
        container.register({ provide: TOKEN, useClass: Direct, multi: true })
        container.register({ provide: TOKEN, useExisting: Legacy, multi: true })

        const all = container.resolveAll<Direct | Legacy>(TOKEN)
        expect(all.map((member) => member.name)).toEqual(["direct", "legacy"])
        expect(all[1]).toBe(container.resolve(Legacy))
    })

    it("may not TARGET a collection that already exists", () => {
        const ALIAS = Symbol("ALIAS")
        const container = new Container()
        container.register({ provide: TOKEN, useValue: "a", multi: true })

        expect(() => container.register({ provide: ALIAS, useExisting: TOKEN })).toThrow(
            "Provider for ALIAS cannot alias PLUGINS: PLUGINS is a multi-provider collection, and `useExisting` is a single-value read of its target"
        )
    })

    it("may not have its target BECOME a collection afterwards", () => {
        const ALIAS = Symbol("ALIAS")
        const container = new Container()
        container.register({ provide: ALIAS, useExisting: TOKEN })

        expect(() => container.register({ provide: TOKEN, useValue: "a", multi: true })).toThrow(
            "Provider for ALIAS cannot alias PLUGINS"
        )
    })

    it("rejects a child's alias onto a collection declared by an ancestor", () => {
        const parent = new Container()
        parent.register({ provide: TOKEN, useValue: "parent", multi: true })
        const child = parent.fork()

        expect(() => child.register({ provide: Symbol("ALIAS"), useExisting: TOKEN })).toThrow(
            "cannot alias PLUGINS"
        )
    })

    it("rejects a child's collection when an ancestor already aliases the token", () => {
        const ALIAS = Symbol("ALIAS")
        const parent = new Container()
        parent.register({ provide: ALIAS, useExisting: TOKEN })
        const child = parent.fork()

        expect(() => child.register({ provide: TOKEN, useValue: "child", multi: true })).toThrow(
            "Provider for ALIAS cannot alias PLUGINS"
        )
    })

    it("leaves an alias onto a single registration alone, in either order", () => {
        const ALIAS = Symbol("ALIAS")
        const before = new Container()
        before.register({ provide: TOKEN, useValue: "target" })
        before.register({ provide: ALIAS, useExisting: TOKEN })
        expect(before.resolve(ALIAS)).toBe("target")

        const after = new Container()
        after.register({ provide: ALIAS, useExisting: TOKEN })
        after.register({ provide: TOKEN, useValue: "target" })
        expect(after.resolve(ALIAS)).toBe("target")
    })

    it("leaves an alias onto a token nobody ever registers alone", () => {
        const container = new Container()
        container.register({ provide: Symbol("ALIAS"), useExisting: TOKEN })

        expect(container.resolveAll(TOKEN)).toEqual([])
    })

    it("names both parties, so neither registration has to be hunted for", () => {
        const container = new Container()
        container.register({ provide: "feature.logger", useExisting: "app.logger" })

        expect(() => container.register({ provide: "app.logger", useValue: 1, multi: true })).toThrow(
            "Provider for feature.logger cannot alias app.logger"
        )
    })
})

describe("lazy uniformity", () => {
    class Service {}
    injectableClass(Service)

    it("accepts a collection whose constructing members agree", () => {
        const container = new Container()
        container.register({ provide: TOKEN, useClass: Service, multi: true, lazy: true })
        container.register({ provide: TOKEN, useFactory: () => new Service(), multi: true, lazy: true })

        expect(container.resolveAll(TOKEN)).toHaveLength(2)
    })

    it("lets a value member into a lazy collection — it has no laziness to disagree about", () => {
        // Structurally outside the rule, not exempted from it: a `useValue` is already an instance, so
        // there is nothing for `lazy` to defer.
        const container = new Container()
        container.register({ provide: TOKEN, useClass: Service, multi: true, lazy: true })
        container.register({ provide: TOKEN, useValue: "ready", multi: true })

        expect(container.resolveAll(TOKEN)).toHaveLength(2)
    })

    it("lets an alias member into a lazy collection for the same reason", () => {
        const container = new Container()
        container.register(Service)
        container.register({ provide: TOKEN, useClass: Service, multi: true, lazy: true })
        container.register({ provide: TOKEN, useExisting: Service, multi: true })

        expect(container.resolveAll(TOKEN)).toHaveLength(2)
    })

    it("lets a value member in first, before the collection is lazy at all", () => {
        // Order must not matter: the value declares nothing, so it cannot set a verdict for the
        // constructing members to be measured against.
        const container = new Container()
        container.register({ provide: TOKEN, useValue: "ready", multi: true })
        container.register({ provide: TOKEN, useClass: Service, multi: true, lazy: true })

        expect(container.resolveAll(TOKEN)).toHaveLength(2)
    })

    it("rejects a lazy member joining an eager collection", () => {
        const container = new Container()
        container.register({ provide: TOKEN, useClass: Service, multi: true })

        expect(() => container.register({ provide: TOKEN, useClass: Service, multi: true, lazy: true })).toThrow(
            "Provider for PLUGINS declares `lazy: true` while the collection already registered for that token is `lazy: false`."
        )
    })

    it("rejects an eager member joining a lazy collection", () => {
        const container = new Container()
        container.register({ provide: TOKEN, useClass: Service, multi: true, lazy: true })

        expect(() => container.register({ provide: TOKEN, useClass: Service, multi: true })).toThrow(
            "Provider for PLUGINS declares `lazy: false` while the collection already registered for that token is `lazy: true`."
        )
    })

    it("is per container, not per chain — each module builds its own contributions", () => {
        const parent = new Container()
        parent.register({ provide: TOKEN, useClass: Service, multi: true })
        const child = parent.fork()
        child.register({ provide: TOKEN, useClass: Service, multi: true, lazy: true })

        expect(child.resolveAll(TOKEN)).toHaveLength(2)
    })
})

describe("multi requires an explicit provide", () => {
    it("rejects the class shorthand at runtime, as the types do at compile time", () => {
        class Service {}
        injectableClass(Service)

        const container = new Container()

        expect(() => container.register({ useClass: Service, multi: true } as never)).toThrow(
            "Provider with `multi: true` requires `provide`"
        )
    })
})

describe("observation", () => {
    it("reports every member of a collection, once each", () => {
        const seen: string[] = []
        class A {
            readonly name = "a"
        }
        class B {
            readonly name = "b"
        }
        injectableClass(A)
        injectableClass(B)

        const container = new Container()
        container.register({ provide: TOKEN, useClass: A, multi: true })
        container.register({ provide: TOKEN, useClass: B, multi: true })
        container.onResolution<A | B>(TOKEN, (instance) => seen.push(instance.name))

        container.resolveAll(TOKEN)
        container.resolveAll(TOKEN)

        expect(seen).toEqual(["a", "b"])
    })

    it("does not observe members registered after the call", () => {
        const seen: string[] = []
        const container = new Container()
        container.register({ provide: TOKEN, useValue: "a", multi: true })
        container.onResolution<string>(TOKEN, (instance) => seen.push(instance))
        container.register({ provide: TOKEN, useValue: "b", multi: true })

        container.resolveAll(TOKEN)

        // Documented, and harmless for ModuleLifecycle: a module registers every provider in its
        // constructor and only observes during init.
        expect(seen).toEqual(["a"])
    })

    it("reports an ancestor's members to the ancestor only", () => {
        const parentSeen: string[] = []
        const childSeen: string[] = []

        const parent = new Container()
        parent.register({ provide: TOKEN, useValue: "parent", multi: true })
        parent.onResolution<string>(TOKEN, (instance) => parentSeen.push(instance))

        const child = parent.fork()
        child.register({ provide: TOKEN, useValue: "child", multi: true })
        child.onResolution<string>(TOKEN, (instance) => childSeen.push(instance))

        expect(child.resolveAll(TOKEN)).toEqual(["child", "parent"])
        expect(parentSeen).toEqual(["parent"])
        expect(childSeen).toEqual(["child"])
    })

    it("still refuses a token with no bindings of its own", () => {
        const container = new Container()

        expect(() => container.onResolution(TOKEN, () => undefined)).toThrow("Cannot observe PLUGINS")
    })

    it("refuses a collection made entirely of aliases", () => {
        // Aliases carry no binding of their own: resolving one fires the TARGET's listener, on the
        // container that registered the target. There is nothing here to attach to.
        class Legacy {}
        injectableClass(Legacy)

        const container = new Container()
        container.register(Legacy)
        container.register({ provide: TOKEN, useExisting: Legacy, multi: true })

        expect(() => container.onResolution(TOKEN, () => undefined)).toThrow("Cannot observe PLUGINS")
    })

    // `onPredicateResolution` is `@internal` and stripped from the published declarations — these tests
    // reach it deliberately, compiling against src, because it is the mechanism the whole adoption
    // contract rests on. Its absence from the public surface is pinned in the consumer fixtures.
    it("the singleton predicate skips a transient member sharing the token", () => {
        // The standing invariant since 0.4.0: transients never participate in lifecycle. Filtering per
        // BINDING rather than per token is what keeps that true inside a collection.
        class Transient {
            readonly name = "transient"
        }
        injectableClass(Transient)

        // One observation per container — see the last test in this block for why they cannot share one.
        const mixed = (): Container => {
            const container = new Container()
            container.register({ provide: TOKEN, useValue: { name: "constant" }, multi: true })
            container.register({ provide: TOKEN, useClass: Transient, multi: true, scope: Scope.Transient })
            return container
        }

        const all: string[] = []
        const everything = mixed()
        everything.onResolution<{ name: string }>(TOKEN, (instance) => all.push(instance.name))

        const retained: string[] = []
        const singletons = mixed()
        singletons.onPredicateResolution<{ name: string }>(
            TOKEN,
            (instance) => retained.push(instance.name),
            (entry) => entry.scope === Scope.Singleton
        )

        for (const container of [everything, singletons]) {
            container.resolveAll(TOKEN)
            container.resolveAll(TOKEN)
            container.resolveAll(TOKEN)
        }

        // `onResolution` is unchanged and still reports every construction, transients included.
        expect(all).toEqual(["constant", "transient", "transient", "transient"])
        expect(retained).toEqual(["constant"])
    })

    it("the singleton predicate attaches to nothing when the token retains nothing", () => {
        class Transient {}
        injectableClass(Transient)

        const seen: unknown[] = []
        const container = new Container()
        container.register({ provide: TOKEN, useClass: Transient, multi: true, scope: Scope.Transient })
        container.register({ provide: TOKEN, useFactory: () => new Transient(), multi: true, scope: Scope.Transient })

        // Not an error: a token whose every binding is transient simply retains nothing.
        container.onPredicateResolution(TOKEN, (instance) => seen.push(instance), (entry) => entry.scope === Scope.Singleton)
        container.resolveAll(TOKEN)

        expect(seen).toEqual([])
    })

    it("a predicate observation still refuses a token with no bindings of its own", () => {
        // Scope decides what is attached to; REGISTRATION is still what the error is about.
        const container = new Container()

        expect(() => container.onPredicateResolution(TOKEN, () => undefined, () => true)).toThrow(
            "Cannot observe PLUGINS"
        )
    })

    it("keeps every observer of a binding, notified in attach order", () => {
        // Inversify's own `onActivation` REPLACES rather than chains — measured in
        // scratch/probe-multiprovider-7-double-activation.ts, which is why the container installs one real
        // handler per binding and dispatches to a list. Without that, the second observer here would
        // silently unhook the first.
        const order: string[] = []

        const container = new Container()
        container.register({ provide: TOKEN, useValue: "v", multi: true })
        container.onResolution<string>(TOKEN, (instance) => order.push(`first:${instance}`))
        container.onResolution<string>(TOKEN, (instance) => order.push(`second:${instance}`))
        container.onResolution<string>(TOKEN, (instance) => order.push(`third:${instance}`))

        container.resolveAll(TOKEN)

        expect(order).toEqual(["first:v", "second:v", "third:v"])
    })

    it("lets onResolution and a predicate observation share a binding", () => {
        const seen: string[] = []

        const container = new Container()
        container.register({ provide: TOKEN, useValue: "v", multi: true })
        container.onResolution<string>(TOKEN, (instance) => seen.push(`all:${instance}`))
        container.onPredicateResolution<string>(
            TOKEN,
            (instance) => seen.push(`retained:${instance}`),
            (entry) => entry.scope === Scope.Singleton
        )

        container.resolveAll(TOKEN)

        expect(seen).toEqual(["all:v", "retained:v"])
    })

    it("notifies every observer of a transient binding on every construction", () => {
        class Service {}
        injectableClass(Service)

        const first: number[] = []
        const second: number[] = []
        let built = 0

        const container = new Container()
        container.register({ provide: TOKEN, useClass: Service, multi: true, scope: Scope.Transient })
        container.onResolution(TOKEN, () => first.push(++built))
        container.onResolution(TOKEN, () => second.push(built))

        container.resolveAll(TOKEN)
        container.resolveAll(TOKEN)

        expect(first).toEqual([1, 2])
        expect(second).toEqual([1, 2])
    })

    it("observes without intercepting — a listener cannot change what resolve hands out", () => {
        const original = { name: "original" }

        const container = new Container()
        container.register({ provide: TOKEN, useValue: original })

        // The signature says `void`, and the dispatcher returns the original whatever a listener does.
        container.onResolution(TOKEN, () => ({ name: "replaced" }) as never)
        container.onResolution(TOKEN, () => undefined)

        expect(container.resolve(TOKEN)).toBe(original)
    })

    it("attaches to the non-alias members of a mixed collection", () => {
        const seen: string[] = []
        class Legacy {
            readonly name = "legacy"
        }
        class Direct {
            readonly name = "direct"
        }
        injectableClass(Legacy)
        injectableClass(Direct)

        const container = new Container()
        container.register(Legacy)
        container.register({ provide: TOKEN, useClass: Direct, multi: true })
        container.register({ provide: TOKEN, useExisting: Legacy, multi: true })
        container.onResolution<Direct>(TOKEN, (instance) => seen.push(instance.name))

        container.resolveAll(TOKEN)

        expect(seen).toEqual(["direct"])
    })
})

describe("scopes inside a collection", () => {
    // Scope is per MEMBER, and there is no uniformity rule. There briefly was one: while adoption was
    // filtered per token, a transient sharing a token with a singleton got adopted and accumulated. Since
    // adoption is filtered per binding (`onPredicateResolution`), the shape it forbade no longer breaks
    // anything, so the guard came out — each member simply behaves as it was declared.

    class Service {}
    injectableClass(Service)

    it("accepts a singleton and a transient member under one token, either order", () => {
        const singletonFirst = new Container()
        singletonFirst.register({ provide: TOKEN, useClass: Service, multi: true })
        singletonFirst.register({ provide: TOKEN, useFactory: () => new Service(), multi: true, scope: Scope.Transient })
        expect(singletonFirst.resolveAll(TOKEN)).toHaveLength(2)

        const transientFirst = new Container()
        transientFirst.register({ provide: TOKEN, useClass: Service, multi: true, scope: Scope.Transient })
        transientFirst.register({ provide: TOKEN, useFactory: () => new Service(), multi: true })
        expect(transientFirst.resolveAll(TOKEN)).toHaveLength(2)
    })

    it("gives each member the identity its own scope asks for", () => {
        const container = new Container()
        container.register({ provide: TOKEN, useClass: Service, multi: true })
        container.register({ provide: TOKEN, useFactory: () => new Service(), multi: true, scope: Scope.Transient })

        const first = container.resolveAll(TOKEN)
        const second = container.resolveAll(TOKEN)

        expect(first[0]).toBe(second[0])
        expect(first[1]).not.toBe(second[1])
    })

    it("keeps an all-transient collection fully transient", () => {
        const container = new Container()
        container.register({ provide: TOKEN, useClass: Service, multi: true, scope: Scope.Transient })
        container.register({ provide: TOKEN, useFactory: () => new Service(), multi: true, scope: Scope.Transient })

        const first = container.resolveAll(TOKEN)
        const second = container.resolveAll(TOKEN)

        expect(first).toHaveLength(2)
        expect(first[0]).not.toBe(second[0])
        expect(first[1]).not.toBe(second[1])
    })

    it("takes value and alias members alongside either scope", () => {
        const container = new Container()
        container.register(Service)
        container.register({ provide: TOKEN, useClass: Service, multi: true, scope: Scope.Transient })
        container.register({ provide: TOKEN, useValue: "constant", multi: true })
        container.register({ provide: TOKEN, useExisting: Service, multi: true })

        expect(container.resolveAll(TOKEN)).toHaveLength(3)
    })

    it("mixes scopes across the chain too", () => {
        const parent = new Container()
        parent.register({ provide: TOKEN, useClass: Service, multi: true })
        const child = parent.fork()
        child.register({ provide: TOKEN, useClass: Service, multi: true, scope: Scope.Transient })

        expect(child.resolveAll(TOKEN)).toHaveLength(2)
    })

    it("still refuses members that disagree about lazy — that one IS group-coupled", () => {
        // The distinction the removal turns on: the eager pass builds a collection whole, so laziness
        // belongs to the group; scope belongs to the binding and nothing reads it collectively.
        const container = new Container()
        container.register({ provide: TOKEN, useClass: Service, multi: true, scope: Scope.Transient })

        expect(() =>
            container.register({ provide: TOKEN, useClass: Service, multi: true, scope: Scope.Transient, lazy: true })
        ).toThrow("declares `lazy: true`")
    })
})

describe("claim precedence", () => {
    class Service {}
    injectableClass(Service)

    // Three claims, in a fixed order — mode, then alias, then lazy — and the first one violated is the one
    // reported. A provider that gets two things wrong hears about the earlier one, so the message never
    // depends on which check happens to be cheaper.

    it("reports the mode conflict before anything about lazy", () => {
        const container = new Container()
        container.register({ provide: TOKEN, useClass: Service })

        expect(() =>
            container.register({ provide: TOKEN, useClass: Service, multi: true, lazy: true })
        ).toThrow("is already a single registration on this container")
    })

    it("reports the alias conflict before anything about lazy", () => {
        const container = new Container()
        container.register({ provide: Symbol("ALIAS"), useExisting: TOKEN })

        expect(() =>
            container.register({ provide: TOKEN, useClass: Service, multi: true, lazy: true })
        ).toThrow("cannot alias PLUGINS")
    })

    it("reports the lazy mismatch once mode and alias are settled", () => {
        const container = new Container()
        container.register({ provide: TOKEN, useClass: Service, multi: true })

        expect(() => container.register({ provide: TOKEN, useClass: Service, multi: true, lazy: true })).toThrow(
            "declares `lazy: true`"
        )
    })
})

// Read-surface parity
// ========================================
//
// `Resolver` mirrors `Container`'s read surface exactly — that is its whole job — and a mode means the same
// thing on every read that takes it. The one surface that cannot carry the whole set is the decorator, and
// its narrower union is measured and pinned below. A factory's `inject` array is the fourth such surface:
// unlike the decorator it is resolved by US, not by inversify's planner, so it carries the whole set and
// routes to the very same reads.

describe("Resolver parity", () => {
    function chain(): { resolver: Resolver; bare: Resolver; leaf: Container } {
        const root = new Container()
        root.register({ provide: TOKEN, useValue: "root", multi: true })
        const leaf = root.fork()
        leaf.register({ provide: TOKEN, useValue: "leaf", multi: true })

        return { resolver: new Resolver(leaf), bare: new Resolver(leaf.fork()), leaf }
    }

    it("collects the chain by default, exactly as the container does", () => {
        const { resolver, leaf } = chain()

        expect(resolver.resolveAll(TOKEN)).toEqual(["leaf", "root"])
        expect(resolver.resolveAll(TOKEN)).toEqual(leaf.resolveAll(TOKEN))
    })

    it("collects one level in self and nearest mode, exactly as the container does", () => {
        const { resolver, leaf } = chain()

        for (const mode of ["self", "nearest"] as const) {
            expect(resolver.resolveAll(TOKEN, mode)).toEqual(["leaf"])
            expect(resolver.resolveAll(TOKEN, mode)).toEqual(leaf.resolveAll(TOKEN, mode))
        }
    })

    it("mirrors the container's nearest-mode ancestor fallback, and its self-mode empty", () => {
        // Owner ruling 2026-08-01: `Resolver` mirrors `Container` exactly, and `Container.resolveAll` in
        // `nearest` mode follows inversify — unchained `getAll` on a container with nothing of its own
        // reads the nearest ancestor that has some (MEASURED, probe-multiprovider-2-getall-chain 2h).
        // `self` is that mode minus the fallback, and it is a mode rather than a guard so the decorator's
        // absence from it is visible in the type rather than silent at the call site.
        const { bare } = chain()

        // Nearest CONTRIBUTING ancestor's own bindings — `leaf` alone — where the chained read gets both.
        expect(bare.resolveAll(TOKEN, "nearest")).toEqual(["leaf"])
        expect(bare.resolveAll(TOKEN, "self")).toEqual([])
        expect(bare.resolveAll(TOKEN)).toEqual(["leaf", "root"])
    })

    it("mirrors the container's single reads, self and nearest alike", () => {
        const SINGLE = Symbol("resolver-single")
        const root = new Container()
        root.register({ provide: SINGLE, useValue: "root" })
        const child = root.fork()
        const resolver = new Resolver(child)

        expect(resolver.resolve(SINGLE, "nearest")).toBe("root")
        expect(resolver.resolveOptional(SINGLE, "self")).toBeUndefined()
        expect(resolver.resolveOr(SINGLE, "fallback", "self")).toBe("fallback")
        expect(resolver.isRegistered(SINGLE, "nearest")).toBe(true)
        expect(resolver.isRegistered(SINGLE, "self")).toBe(false)
        expect(() => resolver.resolve(SINGLE, "self")).toThrow('mode "self" reads its own bindings only')
    })

    it("refuses a single registration through the resolver too", () => {
        const container = new Container()
        container.register({ provide: TOKEN, useValue: "only" })

        expect(() => new Resolver(container).resolveAll(TOKEN)).toThrow("Use `resolve`")
    })
})

describe("@InjectAll parity", () => {
    function collector(token: symbol, mode?: "nearest" | "chained"): Constructor<{ plugins: string[] }> {
        const Collector = class {
            constructor(readonly plugins: string[]) {}
        }
        decorate(Injectable(), Collector)
        decorate(
            (mode === undefined ? InjectAll(token) : InjectAll(token, mode)) as ParameterDecorator,
            Collector,
            0
        )

        return Collector as unknown as Constructor<{ plugins: string[] }>
    }

    it("defaults to the whole chain, agreeing with resolveAll", () => {
        const root = new Container()
        root.register({ provide: TOKEN, useValue: "root", multi: true })
        const leaf = root.fork()
        leaf.register({ provide: TOKEN, useValue: "leaf", multi: true })

        const Default = collector(TOKEN)
        const Chained = collector(TOKEN, "chained")
        leaf.register([Default, Chained])

        expect(leaf.resolve(Default).plugins).toEqual(leaf.resolveAll(TOKEN))
        expect(leaf.resolve(Chained).plugins).toEqual(["leaf", "root"])
    })

    it("agrees with resolveAll in nearest mode when the container has contributions of its own", () => {
        const root = new Container()
        root.register({ provide: TOKEN, useValue: "root", multi: true })
        const leaf = root.fork()
        leaf.register({ provide: TOKEN, useValue: "leaf", multi: true })

        const Nearest = collector(TOKEN, "nearest")
        leaf.register(Nearest)

        expect(leaf.resolve(Nearest).plugins).toEqual(["leaf"])
        expect(leaf.resolve(Nearest).plugins).toEqual(leaf.resolveAll(TOKEN, "nearest"))
    })

    it("agrees with resolveAll in nearest mode when the whole chain is empty", () => {
        const container = new Container()
        const Nearest = collector(Symbol("unbound"), "nearest")
        container.register(Nearest)

        expect(container.resolve(Nearest).plugins).toEqual([])
    })

    it("AGREES on an empty own container with a contributing ancestor — every surface that has `nearest`", () => {
        // This corner used to be the one divergence: `Container.resolveAll(token, false)` guarded
        // inversify's fallback and answered [], while the decorator — resolving inside inversify's planner,
        // out of reach of any guard — answered the ancestor's members (MEASURED, probe-8 8a/8c).
        //
        // Owner ruling 2026-08-01: conform to the substrate, then name the guard instead of hiding it.
        // `nearest` IS the substrate everywhere, decorator included; the guarded read became `self`, which
        // the decorator's union deliberately excludes because the planner cannot express it.
        const root = new Container()
        root.register({ provide: TOKEN, useValue: "root", multi: true })
        const bare = root.fork()

        const Nearest = collector(TOKEN, "nearest")
        bare.register(Nearest)

        expect(bare.resolve(Nearest).plugins).toEqual(["root"])
        expect(bare.resolveAll(TOKEN, "nearest")).toEqual(["root"])
        expect(new Resolver(bare).resolveAll(TOKEN, "nearest")).toEqual(["root"])

        // ...and the mode the decorator cannot have is exactly the one that answers differently here.
        expect(bare.resolveAll(TOKEN, "self")).toEqual([])
    })

    it("accepts an enum member as readily as the literal", () => {
        const root = new Container()
        root.register({ provide: TOKEN, useValue: "root", multi: true })
        const leaf = root.fork()
        leaf.register({ provide: TOKEN, useValue: "leaf", multi: true })

        const Member = collector(TOKEN, ResolveAllMode.Nearest)
        leaf.register(Member)

        expect(leaf.resolve(Member).plugins).toEqual(["leaf"])
    })
})

describe("factory inject parity", () => {
    // The grammar is two named arms discriminated by `multi`, and the runtime behind it is pure routing:
    // `multi: true` is `resolveAll`, `optional` is `resolveOptional`, anything else is `resolve` — each with
    // that read's own default mode and, crucially, that read's own errors. Nothing below asserts a
    // behaviour of `inject`; every assertion is that `inject` has none of its own.

    /** root and leaf both contribute; `bare` is a further fork that contributes nothing of its own. */
    function chain(): { root: Container; leaf: Container; bare: Container } {
        const root = new Container()
        root.register({ provide: TOKEN, useValue: "root", multi: true })
        const leaf = root.fork()
        leaf.register({ provide: TOKEN, useValue: "leaf", multi: true })

        return { root, leaf, bare: leaf.fork() }
    }

    /**
     * Hand `dependency` to a factory on `container` and return what the factory received. A fresh token
     * per call, so a container can be measured several times without forking — forking would move the
     * read position, which is the very thing the mode tests are about.
     */
    function injected(container: Container, dependency: FactoryDependency): unknown {
        const token = Symbol("COLLECTOR")
        container.register({ provide: token, useFactory: (received: unknown) => received, inject: [dependency] })

        return container.resolve(token)
    }

    /** The message a read throws, so an inject entry can be pinned against it rather than against a copy. */
    function messageOf(read: () => unknown): string {
        let message: string | undefined
        try {
            read()
        } catch (error) {
            message = (error as Error).message
        }

        expect(message).toBeDefined()
        return message as string
    }

    it("hands a factory the whole chain's collection by default", () => {
        const { leaf } = chain()

        expect(injected(leaf, { token: TOKEN, multi: true })).toEqual(["leaf", "root"])
        expect(injected(leaf, { token: TOKEN, multi: true })).toEqual(leaf.resolveAll(TOKEN))
        expect(injected(leaf, { token: TOKEN, multi: true, mode: ResolveAllMode.Chained })).toEqual(["leaf", "root"])
    })

    it("means by self and nearest exactly what resolveAll means by them", () => {
        const { leaf, bare } = chain()

        expect(injected(leaf, { token: TOKEN, multi: true, mode: "self" })).toEqual(["leaf"])
        expect(injected(leaf, { token: TOKEN, multi: true, mode: "nearest" })).toEqual(["leaf"])

        // The distinction the two modes exist for. `bare` declares nothing: `self` is own-only and reads
        // `[]`, `nearest` falls back to the nearest CONTRIBUTOR's own bindings — `leaf` alone, never the
        // chain above it, which is what `chained` is for.
        expect(injected(bare, { token: TOKEN, multi: true, mode: "self" })).toEqual([])
        expect(injected(bare, { token: TOKEN, multi: true, mode: "nearest" })).toEqual(["leaf"])
        expect(injected(bare, { token: TOKEN, multi: true })).toEqual(["leaf", "root"])

        for (const mode of ["self", "nearest", "chained"] as const) {
            expect(injected(bare, { token: TOKEN, multi: true, mode })).toEqual(bare.resolveAll(TOKEN, mode))
        }
    })

    it("reads [] for a collection point nobody filled, rather than failing the factory", () => {
        const container = new Container()

        expect(injected(container, { token: Symbol("unfilled"), multi: true })).toEqual([])
    })

    it("keeps the bare token meaning one value, nearest, required", () => {
        const SINGLE = Symbol("SINGLE")
        const root = new Container()
        root.register({ provide: SINGLE, useValue: "root" })
        const child = root.fork()

        expect(injected(child, SINGLE)).toBe("root")
        expect(injected(child, { token: SINGLE })).toBe("root")
        expect(injected(child, { token: SINGLE, mode: "nearest" })).toBe("root")
        expect(injected(child, { token: SINGLE, optional: false })).toBe("root")
    })

    it("carries self onto the single reads too, throwing or not exactly as they do", () => {
        const SINGLE = Symbol("SINGLE")
        const root = new Container()
        root.register({ provide: SINGLE, useValue: "root" })
        const child = root.fork()

        expect(injected(root, { token: SINGLE, mode: "self" })).toBe("root")
        expect(() => injected(child, { token: SINGLE, mode: "self" })).toThrow(
            messageOf(() => child.resolve(SINGLE, "self"))
        )
        expect(injected(child, { token: SINGLE, optional: true, mode: "self" })).toBeUndefined()
    })

    it("routes optional to the safe read, and only optional", () => {
        const MISSING = Symbol("MISSING")
        const container = new Container()

        expect(injected(container, { token: MISSING, optional: true })).toBeUndefined()
        expect(() => injected(container, { token: MISSING })).toThrow(messageOf(() => container.resolve(MISSING)))
    })

    it("inherits the collection guard verbatim — multi: true onto a single registration", () => {
        const container = new Container()
        container.register({ provide: TOKEN, useValue: "only" })

        // Not a new error about `inject`: the message `resolveAll` would have produced, unchanged.
        expect(() => injected(container, { token: TOKEN, multi: true })).toThrow(
            messageOf(() => container.resolveAll(TOKEN))
        )
    })

    it("inherits the single guard verbatim — a single read onto a collection", () => {
        const container = new Container()
        container.register({ provide: TOKEN, useValue: "a", multi: true })
        const expected = messageOf(() => container.resolve(TOKEN))

        expect(() => injected(container, TOKEN)).toThrow(expected)
        expect(() => injected(container, { token: TOKEN })).toThrow(expected)

        // `optional` does not soften it either — `resolveOptional` refuses a collection rather than reporting
        // absence, and the inject entry is that call.
        expect(() => injected(container, { token: TOKEN, optional: true })).toThrow(
            messageOf(() => container.resolveOptional(TOKEN))
        )
    })

    it("mixes the arms in one inject array, in order", () => {
        const { leaf } = chain()
        const SINGLE = Symbol("SINGLE")
        const MISSING = Symbol("MISSING")
        leaf.register({ provide: SINGLE, useValue: "one" })

        const HOST = Symbol("HOST")
        leaf.register({
            provide: HOST,
            useFactory: (...args: unknown[]) => args,
            inject: [SINGLE, { token: MISSING, optional: true }, { token: TOKEN, multi: true, mode: "self" }],
        })

        expect(leaf.resolve(HOST)).toEqual(["one", undefined, ["leaf"]])
    })
})

// The half of the grammar no `it` can reach: what the two arms REFUSE. Checked by `npm run
// typecheck:tests`; the same pins run against the published declarations in the consumer fixtures.
// ========================================

class Pinned {}

const acceptedProviders: ClassProvider[] = [
    { provide: TOKEN, useClass: Pinned, multi: true },
    { provide: TOKEN, useClass: Pinned, multi: false },
    { useClass: Pinned, multi: false },
]
void acceptedProviders

// @ts-expect-error the provide-less shorthand still cannot join a collection, so `multi: true` needs a `provide`.
const multiShorthand: ClassProvider = { useClass: Pinned, multi: true }
void multiShorthand

const acceptedDependencies: FactoryDependency[] = [
    TOKEN,
    { token: TOKEN },
    { token: TOKEN, optional: true },
    { token: TOKEN, mode: "self" },
    { token: TOKEN, multi: true },
    { token: TOKEN, multi: true, mode: ResolveAllMode.Chained },
]
void acceptedDependencies

// @ts-expect-error a collection read cannot miss — `resolveAll` reads `[]` — so there is no optional state.
const optionalMulti: FactoryDependency = { token: TOKEN, multi: true, optional: true }
void optionalMulti

// @ts-expect-error `mode` follows the discriminant, and `chained` belongs to the collection arm alone.
const chainedSingle: FactoryDependency = { token: TOKEN, mode: "chained" }
void chainedSingle

// @ts-expect-error the collection arm still takes only the three modes it has.
const bogusMulti: FactoryDependency = { token: TOKEN, multi: true, mode: "bogus" }
void bogusMulti
