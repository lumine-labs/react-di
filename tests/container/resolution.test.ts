import { describe, expect, it, vi } from "vitest"

import {
    Container,
    InjectAll,
    Injectable,
    RegistrationMode,
    ResolveAllMode,
    ResolveMode,
    Scope,
    decorate,
} from "../../src/container/index.js"
import type { Constructor } from "../../src/container/index.js"

// resolve / resolveOptional / resolveOr / resolveAll / isRegistered.
// ========================================
//
// One vocabulary, two widths. Every read takes a MODE, and the modes are named for what they read rather
// than for a traversal flag:
//
//   self     — this container's own bindings only.
//   nearest  — the substrate's own walk: `get` for a single read, unchained `getAll` for a collection.
//   chained  — collections only: every level accumulated, nearest first.
//
// Single reads stop at two, because one value cannot be accumulated. `nearest` is the default for a single
// read and `chained` for `resolveAll`, which is what each family meant before the modes existed.
//
// The two families never meet on one token: a single registration refuses `resolveAll` and a collection
// refuses `resolve`, so a chain is either shadowing (`chain()`) or contributing (`multiChain()`).

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

/** The same three levels, contributing to one collection instead of shadowing each other. */
function multiChain(): { root: Container; middle: Container; leaf: Container; token: symbol } {
    const token = Symbol("PLUGIN")
    const root = new Container()
    root.register({ provide: token, useValue: "root", multi: true })
    const middle = root.fork()
    middle.register({ provide: token, useValue: "middle", multi: true })
    const leaf = middle.fork()
    leaf.register({ provide: token, useValue: "leaf", multi: true })
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

    it("refuses an inherited token in self mode", () => {
        const TOKEN = Symbol("own-only")
        const parent = new Container()
        parent.register({ provide: TOKEN, useValue: "value" })
        const child = parent.fork()

        expect(() => child.resolve(TOKEN, "self")).toThrow(
            /Token own-only is not registered in this container \(mode "self" reads its own bindings only\)\. Use "nearest" to search its ancestors too\./
        )
        expect(parent.resolve(TOKEN, "self")).toBe("value")
        expect(child.resolve(TOKEN, "nearest")).toBe("value")
    })

    it("throws a chain-aware message for a token nobody declares", () => {
        const container = new Container().fork()

        expect(() => container.resolve(Symbol("nowhere"))).toThrow(
            /Token nowhere is not registered in this container or any ancestor\./
        )
    })
})

describe("resolveOptional", () => {
    it("returns the instance when registered", () => {
        class Service {}
        injectableClass(Service)
        const container = new Container()
        container.register(Service)

        expect(container.resolveOptional(Service)).toBeInstanceOf(Service)
    })

    it("returns undefined instead of throwing for a miss", () => {
        expect(new Container().resolveOptional(Symbol("missing"))).toBeUndefined()
    })

    it("returns undefined for an inherited token in self mode", () => {
        const TOKEN = Symbol("inherited-safe")
        const parent = new Container()
        parent.register({ provide: TOKEN, useValue: "value" })
        const child = parent.fork()

        expect(child.resolveOptional(TOKEN)).toBe("value")
        expect(child.resolveOptional(TOKEN, "nearest")).toBe("value")
        expect(child.resolveOptional(TOKEN, "self")).toBeUndefined()
    })

    it("does not construct anything on a miss", () => {
        const factory = vi.fn(() => "built")
        const REGISTERED = Symbol("registered")
        const container = new Container()
        container.register({ provide: REGISTERED, useFactory: factory })

        expect(container.resolveOptional(Symbol("other"))).toBeUndefined()
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

    it("falls back for an inherited token in self mode", () => {
        const TOKEN = Symbol("inherited-or")
        const parent = new Container()
        parent.register({ provide: TOKEN, useValue: "parent" })
        const child = parent.fork()

        expect(child.resolveOr(TOKEN, "fallback")).toBe("parent")
        expect(child.resolveOr(TOKEN, "fallback", "nearest")).toBe("parent")
        expect(child.resolveOr(TOKEN, "fallback", "self")).toBe("fallback")
        expect(child.resolveOr(TOKEN, () => "thunk", "self")).toBe("thunk")
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
        const { leaf, token } = multiChain()

        expect(leaf.resolveAll(token)).toEqual(["leaf", "middle", "root"])
    })

    it("is chained from a container that declares nothing", () => {
        const { leaf, token } = multiChain()
        const bare = leaf.fork()

        expect(bare.resolveAll(token)).toEqual(["leaf", "middle", "root"])
    })

    it("sees only what is at or above it", () => {
        const { root, middle, token } = multiChain()

        expect(middle.resolveAll(token)).toEqual(["middle", "root"])
        expect(root.resolveAll(token)).toEqual(["root"])
    })

    it("reads one level in self and nearest mode when the container contributes", () => {
        const { root, middle, leaf, token } = multiChain()

        // A container with bindings of its own cannot tell the two apart — the fallback that separates
        // them never fires. That is the whole difference, and the next two tests are where it shows.
        for (const mode of ["self", "nearest"] as const) {
            expect(leaf.resolveAll(token, mode)).toEqual(["leaf"])
            expect(middle.resolveAll(token, mode)).toEqual(["middle"])
            expect(root.resolveAll(token, mode)).toEqual(["root"])
        }
    })

    it("answers [] in self mode from a container with no bindings of its own", () => {
        const { leaf, token } = multiChain()
        const bare = leaf.fork()

        // `self` means own-only, and own-only on a container that declares nothing is empty. This is the
        // mode the module lifecycle's eager pass needs: build what this module declared, nothing else.
        expect(bare.resolveAll(token, "self")).toEqual([])
    })

    it("falls back to the nearest contributing ancestor in nearest mode", () => {
        const { leaf, token } = multiChain()
        const bare = leaf.fork()

        // Owner ruling 2026-08-01: this is inversify's own unchained `getAll` behaviour (MEASURED in
        // probe-multiprovider-2-getall-chain 2h), and `nearest` conforms to it rather than guarding. It is
        // what lets Container, Resolver, useResolveAll and @InjectAll agree — the decorator resolves inside
        // inversify's planner and could never have joined a guarded contract.
        // Note the shape: it reads ONE container's bindings — the nearest contributor's, `leaf` alone —
        // never the chain above it. Accumulation is what `chained` is for.
        expect(bare.resolveAll(token, "nearest")).toEqual(["leaf"])
        expect(bare.resolveAll(token, "chained")).toEqual(["leaf", "middle", "root"])
    })

    it("accepts an enum member and a bare string alike, Scope-style", () => {
        const { leaf, token } = multiChain()
        const bare = leaf.fork()

        expect(bare.resolveAll(token, ResolveAllMode.Self)).toEqual(bare.resolveAll(token, "self"))
        expect(bare.resolveAll(token, ResolveAllMode.Nearest)).toEqual(bare.resolveAll(token, "nearest"))
        expect(bare.resolveAll(token, ResolveAllMode.Chained)).toEqual(bare.resolveAll(token, "chained"))

        const single = Symbol("both-forms-single")
        leaf.register({ provide: single, useValue: "value" })
        expect(leaf.resolve(single, ResolveMode.Self)).toBe(leaf.resolve(single, "self"))
        expect(leaf.resolve(single, ResolveMode.Nearest)).toBe(leaf.resolve(single, "nearest"))

        // `isRegistered` takes `RegistrationMode`, not `ResolveMode` — a registration question, not a
        // resolution one. Same members today, and the member/literal interchange is the same idiom.
        expect(leaf.isRegistered(single, RegistrationMode.Self)).toBe(leaf.isRegistered(single, "self"))
        expect(leaf.isRegistered(single, RegistrationMode.Nearest)).toBe(leaf.isRegistered(single, "nearest"))

        // The members ARE the strings — same idiom as `Scope`, no normalization step anywhere.
        expect([ResolveMode.Self, ResolveMode.Nearest]).toEqual(["self", "nearest"])
        expect([RegistrationMode.Self, RegistrationMode.Nearest]).toEqual(["self", "nearest"])
        expect([ResolveAllMode.Self, ResolveAllMode.Nearest, ResolveAllMode.Chained]).toEqual([
            "self",
            "nearest",
            "chained",
        ])
    })

    it("returns [] when nothing in the chain declares the token", () => {
        const root = new Container()
        const child = root.fork()

        expect(root.resolveAll(Symbol("unbound"))).toEqual([])
        expect(child.resolveAll(Symbol("unbound"))).toEqual([])
    })

    it("returns the same instances every call, without rebuilding them", () => {
        const built: string[] = []
        class Service {
            constructor() {
                built.push("built")
            }
        }
        injectableClass(Service)
        const TOKEN = Symbol("all-instances")

        const root = new Container()
        root.register({ provide: TOKEN, useClass: Service, multi: true })
        const child = root.fork()
        child.register({ provide: TOKEN, useClass: Service, multi: true })

        const all = child.resolveAll(TOKEN)
        expect(all).toHaveLength(2)
        expect(all[0]).toBe(child.resolveAll(TOKEN, "self")[0])
        expect(all[1]).toBe(root.resolveAll(TOKEN)[0])
        expect(all).toEqual(child.resolveAll(TOKEN))
        expect(built).toHaveLength(2)
    })

    it("builds a fresh instance per call for a transient declaration", () => {
        class Service {}
        injectableClass(Service)
        const TOKEN = Symbol("all-transient")

        const container = new Container()
        container.register({ provide: TOKEN, useClass: Service, scope: Scope.Transient, multi: true })

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
        const { leaf, token } = multiChain()
        const Collector = collector(token)
        leaf.register(Collector)

        const injected = leaf.resolve(Collector).plugins

        expect(injected).toEqual(leaf.resolveAll(token))
        expect(injected).toEqual(["leaf", "middle", "root"])
    })

    it("agrees with resolveAll from a container part-way up the chain", () => {
        const { middle, token } = multiChain()
        const Collector = collector(token)
        middle.register(Collector)

        const injected = middle.resolve(Collector).plugins

        // The unchained default would have handed back just ["middle"] here — this is the divergence.
        expect(injected).toEqual(middle.resolveAll(token))
        expect(injected).toEqual(["middle", "root"])
    })

    it("agrees with resolveAll when the injecting container declares nothing itself", () => {
        const { leaf, token } = multiChain()
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
        root.register({ provide: TOKEN, useClass: Plugin, multi: true })
        const child = root.fork()
        child.register({ provide: TOKEN, useClass: Plugin, multi: true })

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
        expect(container.isRegistered(TOKEN, "self")).toBe(true)
    })

    it("distinguishes inherited from own", () => {
        const TOKEN = Symbol("inherited-check")
        const parent = new Container()
        parent.register({ provide: TOKEN, useValue: 1 })
        const child = parent.fork()

        expect(child.isRegistered(TOKEN)).toBe(true)
        expect(child.isRegistered(TOKEN, "nearest")).toBe(true)
        expect(child.isRegistered(TOKEN, "self")).toBe(false)
    })

    it("is false for an unknown token under both modes", () => {
        const container = new Container().fork()
        const TOKEN = Symbol("unknown")

        expect(container.isRegistered(TOKEN)).toBe(false)
        expect(container.isRegistered(TOKEN, "self")).toBe(false)
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
