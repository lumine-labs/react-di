import { describe, expect, it, vi } from "vitest"

import { Container, InjectAll, Injectable, Scope, decorate } from "../../src/container/index.js"
import type { Constructor } from "../../src/container/index.js"

// resolve / resolveSafe / resolveOr / resolveAll / isRegistered.
// ========================================
//
// `recursive` (default true) is the only knob: true searches the ancestor chain, false searches the
// container itself. `resolveAll` has no such knob — it is always chained, and so is `@InjectAll`.

function injectableClass<T extends Constructor>(target: T): T {
    decorate(Injectable(), target)
    return target
}

function chain(): { root: Container; middle: Container; leaf: Container; token: symbol } {
    const token = Symbol("PLUGIN")
    const root = new Container()
    root.register({ provide: token, useValue: "root" })
    const middle = root.fork()
    middle.register({ provide: token, useValue: "middle" })
    const leaf = middle.fork()
    leaf.register({ provide: token, useValue: "leaf" })
    return { root, middle, leaf, token }
}

describe("resolve", () => {
    it("finds a token declared by an ancestor", () => {
        const TOKEN = Symbol("inherited")
        const parent = new Container()
        parent.register({ provide: TOKEN, useValue: "value" })

        expect(parent.fork().fork().resolve(TOKEN)).toBe("value")
    })

    it("prefers the nearest declaration", () => {
        const { leaf, middle, root, token } = chain()

        expect([leaf.resolve(token), middle.resolve(token), root.resolve(token)]).toEqual(["leaf", "middle", "root"])
    })

    it("refuses an inherited token when recursive is false", () => {
        const TOKEN = Symbol("own-only")
        const parent = new Container()
        parent.register({ provide: TOKEN, useValue: "value" })
        const child = parent.fork()

        expect(() => child.resolve(TOKEN, false)).toThrow(
            /Token own-only is not registered in this container \(searched that container only\)\./
        )
        expect(parent.resolve(TOKEN, false)).toBe("value")
    })

    it("throws a chain-aware message for a token nobody declares", () => {
        const container = new Container().fork()

        expect(() => container.resolve(Symbol("nowhere"))).toThrow(
            /Token nowhere is not registered in this container or any ancestor\./
        )
    })
})

describe("resolveSafe", () => {
    it("returns the instance when registered", () => {
        class Service {}
        injectableClass(Service)
        const container = new Container()
        container.register(Service)

        expect(container.resolveSafe(Service)).toBeInstanceOf(Service)
    })

    it("returns undefined instead of throwing for a miss", () => {
        expect(new Container().resolveSafe(Symbol("missing"))).toBeUndefined()
    })

    it("returns undefined for an inherited token when recursive is false", () => {
        const TOKEN = Symbol("inherited-safe")
        const parent = new Container()
        parent.register({ provide: TOKEN, useValue: "value" })
        const child = parent.fork()

        expect(child.resolveSafe(TOKEN)).toBe("value")
        expect(child.resolveSafe(TOKEN, false)).toBeUndefined()
    })

    it("does not construct anything on a miss", () => {
        const factory = vi.fn(() => "built")
        const REGISTERED = Symbol("registered")
        const container = new Container()
        container.register({ provide: REGISTERED, useFactory: factory })

        expect(container.resolveSafe(Symbol("other"))).toBeUndefined()
        expect(factory).not.toHaveBeenCalled()
    })
})

describe("resolveOr", () => {
    it("returns the registered value and never touches the fallback thunk", () => {
        const TOKEN = Symbol("config")
        const fallback = vi.fn(() => ({ retries: 0 }))
        const container = new Container()
        container.register({ provide: TOKEN, useValue: { retries: 2 } })

        expect(container.resolveOr(TOKEN, fallback)).toEqual({ retries: 2 })
        expect(fallback).not.toHaveBeenCalled()
    })

    it("calls the fallback thunk exactly once on a miss", () => {
        const fallback = vi.fn(() => ({ retries: 9 }))
        const container = new Container()

        expect(container.resolveOr(Symbol("missing"), fallback)).toEqual({ retries: 9 })
        expect(fallback).toHaveBeenCalledTimes(1)
    })

    it("accepts an eager (non-thunk) fallback", () => {
        const container = new Container()
        const TOKEN = Symbol("eager")
        container.register({ provide: TOKEN, useValue: "hit" })

        expect(container.resolveOr(TOKEN, "fallback")).toBe("hit")
        expect(container.resolveOr(Symbol("miss"), "fallback")).toBe("fallback")
    })

    it("falls back for an inherited token when recursive is false", () => {
        const TOKEN = Symbol("inherited-or")
        const parent = new Container()
        parent.register({ provide: TOKEN, useValue: "parent" })
        const child = parent.fork()

        expect(child.resolveOr(TOKEN, "fallback")).toBe("parent")
        expect(child.resolveOr(TOKEN, "fallback", false)).toBe("fallback")
        expect(child.resolveOr(TOKEN, () => "thunk", false)).toBe("thunk")
    })

    it("infers `T | F`, never `T | (() => F)`", () => {
        class Missing {
            readonly kind = "missing"
        }
        const container = new Container()

        // Compile-time gate: these assignments stop compiling the moment the thunk type leaks into the
        // return type, which is the whole point of the two overloads.
        const fromThunk: Missing | number = container.resolveOr(Missing, () => 7)
        const fromValue: Missing | number = container.resolveOr(Missing, 7)
        const fromNullThunk: Missing | null = container.resolveOr(Missing, () => null)
        const fromStringToken: string = container.resolveOr<string, string>("nope", () => "fallback")

        expect([fromThunk, fromValue, fromNullThunk, fromStringToken]).toEqual([7, 7, null, "fallback"])
    })

    it("resolves a class token to its instance rather than the fallback", () => {
        class Service {
            readonly kind = "service"
        }
        injectableClass(Service)
        const container = new Container()
        container.register(Service)

        const resolved: Service | null = container.resolveOr(Service, () => null)
        expect(resolved).toBeInstanceOf(Service)
    })
})

describe("resolveAll", () => {
    it("collects every declaration in the chain, nearest first", () => {
        const { leaf, token } = chain()

        expect(leaf.resolveAll(token)).toEqual(["leaf", "middle", "root"])
    })

    it("is chained from a container that declares nothing", () => {
        const { leaf, token } = chain()
        const bare = leaf.fork()

        expect(bare.resolveAll(token)).toEqual(["leaf", "middle", "root"])
    })

    it("sees only what is at or above it", () => {
        const { root, middle, token } = chain()

        expect(middle.resolveAll(token)).toEqual(["middle", "root"])
        expect(root.resolveAll(token)).toEqual(["root"])
    })

    it("returns [] when nothing in the chain declares the token", () => {
        const root = new Container()
        const child = root.fork()

        expect(root.resolveAll(Symbol("unbound"))).toEqual([])
        expect(child.resolveAll(Symbol("unbound"))).toEqual([])
    })

    it("returns the same instances resolve would, without rebuilding them", () => {
        const built: string[] = []
        class Service {
            constructor() {
                built.push("built")
            }
        }
        injectableClass(Service)

        const root = new Container()
        root.register(Service)
        const child = root.fork()
        child.register(Service)

        const all = child.resolveAll(Service)
        expect(all).toHaveLength(2)
        expect(all[0]).toBe(child.resolve(Service))
        expect(all[1]).toBe(root.resolve(Service))
        expect(built).toHaveLength(2)
    })

    it("builds a fresh instance per call for a transient declaration", () => {
        class Service {}
        injectableClass(Service)
        const TOKEN = Symbol("all-transient")

        const container = new Container()
        container.register({ provide: TOKEN, useClass: Service, scope: Scope.Transient })

        const first = container.resolveAll(TOKEN)
        const second = container.resolveAll(TOKEN)

        expect(first).toHaveLength(1)
        expect(first[0]).not.toBe(second[0])
    })
})

// @InjectAll and resolveAll are one semantics
// ========================================
//
// The two multi-injection paths must not disagree — the same token reached through a constructor and
// through the container has to yield the same set, or "all the plugins" means one thing in a service and
// another in a hook. `InjectAll` therefore hardcodes `{ chained: true }` to match `resolveAll`; inversify's
// `multiInject` defaults to UNCHAINED, and that default is exactly what diverges once a token is declared
// in both a module and an ancestor. These tests assert the two paths against EACH OTHER, so a regression on
// either side fails here rather than quietly splitting the semantics in two.

describe("@InjectAll", () => {
    function collector(token: symbol): Constructor<{ plugins: string[] }> {
        const Collector = class {
            constructor(readonly plugins: string[]) {}
        }
        decorate(Injectable(), Collector)
        decorate(InjectAll(token) as ParameterDecorator, Collector, 0)

        return Collector as unknown as Constructor<{ plugins: string[] }>
    }

    it("collects the whole chain, exactly as resolveAll does for the same container", () => {
        const { leaf, token } = chain()
        const Collector = collector(token)
        leaf.register(Collector)

        const injected = leaf.resolve(Collector).plugins

        expect(injected).toEqual(leaf.resolveAll(token))
        expect(injected).toEqual(["leaf", "middle", "root"])
    })

    it("agrees with resolveAll from a container part-way up the chain", () => {
        const { middle, token } = chain()
        const Collector = collector(token)
        middle.register(Collector)

        const injected = middle.resolve(Collector).plugins

        // The unchained default would have handed back just ["middle"] here — this is the divergence.
        expect(injected).toEqual(middle.resolveAll(token))
        expect(injected).toEqual(["middle", "root"])
    })

    it("agrees with resolveAll when the injecting container declares nothing itself", () => {
        const { leaf, token } = chain()
        const bare = leaf.fork()
        const Collector = collector(token)
        bare.register(Collector)

        const injected = bare.resolve(Collector).plugins

        expect(injected).toEqual(bare.resolveAll(token))
        expect(injected).toEqual(["leaf", "middle", "root"])
    })

    it("agrees with resolveAll on an empty result", () => {
        const EMPTY = Symbol("unbound-plugins")
        const container = new Container()
        const Collector = collector(EMPTY)
        container.register(Collector)

        expect(container.resolve(Collector).plugins).toEqual(container.resolveAll(EMPTY))
        expect(container.resolve(Collector).plugins).toEqual([])
    })

    it("injects the very instances resolveAll returns", () => {
        const TOKEN = Symbol("plugin-instances")
        class Plugin {}
        injectableClass(Plugin)

        const root = new Container()
        root.register({ provide: TOKEN, useClass: Plugin })
        const child = root.fork()
        child.register({ provide: TOKEN, useClass: Plugin })

        const Collector = collector(TOKEN)
        child.register(Collector)

        // Identity, not just shape: singletons are shared with the container path, never rebuilt for the
        // injection site.
        expect(child.resolve(Collector).plugins).toEqual(child.resolveAll(TOKEN))
        expect(child.resolve(Collector).plugins[0]).toBe(child.resolveAll(TOKEN)[0])
    })
})

describe("isRegistered", () => {
    it("reports own bindings under both modes", () => {
        const TOKEN = Symbol("own")
        const container = new Container()
        container.register({ provide: TOKEN, useValue: 1 })

        expect(container.isRegistered(TOKEN)).toBe(true)
        expect(container.isRegistered(TOKEN, false)).toBe(true)
    })

    it("distinguishes inherited from own", () => {
        const TOKEN = Symbol("inherited-check")
        const parent = new Container()
        parent.register({ provide: TOKEN, useValue: 1 })
        const child = parent.fork()

        expect(child.isRegistered(TOKEN)).toBe(true)
        expect(child.isRegistered(TOKEN, false)).toBe(false)
    })

    it("is false for an unknown token under both modes", () => {
        const container = new Container().fork()
        const TOKEN = Symbol("unknown")

        expect(container.isRegistered(TOKEN)).toBe(false)
        expect(container.isRegistered(TOKEN, false)).toBe(false)
    })

    it("does not construct the instance it reports on", () => {
        const factory = vi.fn(() => "built")
        const TOKEN = Symbol("untouched")
        const container = new Container()
        container.register({ provide: TOKEN, useFactory: factory })

        expect(container.isRegistered(TOKEN)).toBe(true)
        expect(factory).not.toHaveBeenCalled()
    })
})
