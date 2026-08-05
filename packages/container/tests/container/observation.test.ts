import { describe, expect, it } from "vitest"

import { Container } from "../../src/container.js"
import { Scope, type EntrySnapshot } from "../../src/container.types.js"
import { inject } from "../../src/injector.js"

// onResolution — the hook a lifecycle layer is built on.
// ========================================
//
// It reports instances at construction time, on the container that owns the binding. Everything the layer
// above knows about "what belongs to this module" comes from here.

describe("onResolution", () => {
    it("fires once per constructed singleton, however often it is resolved", () => {
        class Service {}
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
        const seen: unknown[] = []

        const container = new Container()
        container.register(Service)
        container.onResolution(Service, (instance) => seen.push(instance))

        expect(seen).toEqual([])
    })

    it("fires on the owning container when a descendant resolves the binding", () => {
        class Service {}
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
        class Dependent {
            readonly dependency = inject(B)
        }

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

// The second argument — values arrive with their snapshot
// ========================================
//
// Observation follows the same pattern as the metadata plane: a listener is handed the value AND the frozen
// `EntrySnapshot` of the entry that produced it. That is what lets an adoption layer decide what to do with
// an instance without keeping its own parallel index of what it attached to.

describe("the snapshot a listener receives", () => {
    it("describes the entry that produced the value, not the token that was read", () => {
        const TOKEN = Symbol("described")
        class Service {}
        const seen: EntrySnapshot[] = []

        const container = new Container()
        container.register({ provide: TOKEN, useClass: Service, scope: Scope.Transient })
        container.onResolution(TOKEN, (_instance, snapshot) => seen.push(snapshot))

        container.resolve(TOKEN)

        expect(seen).toEqual([{ kind: "class", token: TOKEN, scope: "transient", multi: false }])
    })

    it("is the same snapshot `entry` hands out for that registration", () => {
        const TOKEN = Symbol("agreeing")
        let reported: EntrySnapshot | undefined

        const container = new Container()
        container.register({ provide: TOKEN, useFactory: () => ({ built: true }) })
        container.onResolution(TOKEN, (_instance, snapshot) => {
            reported = snapshot
        })

        container.resolve(TOKEN)

        expect(reported).toEqual(container.entry(TOKEN))
        expect(reported).toEqual({ kind: "factory", token: TOKEN, scope: "singleton", multi: false })
    })

    it("is frozen, like every other snapshot the container hands out", () => {
        const TOKEN = Symbol("frozen")
        let reported: EntrySnapshot | undefined

        const container = new Container()
        container.register({ provide: TOKEN, useValue: "v" })
        container.onResolution(TOKEN, (_instance, snapshot) => {
            reported = snapshot
        })

        container.resolve(TOKEN)

        expect(Object.isFrozen(reported)).toBe(true)
        expect(() => {
            ;(reported as { multi: boolean }).multi = true
        }).toThrow(TypeError)
    })

    it("distinguishes the members of one collection", () => {
        const TOKEN = Symbol("collection")
        class Transient {}
        const seen: string[] = []

        const container = new Container()
        container.register([
            { provide: TOKEN, useValue: "constant", multi: true },
            { provide: TOKEN, useClass: Transient, scope: Scope.Transient, multi: true },
        ])
        // `.scope` with no `kind` guard in front of it: a listener's snapshot is a `BindingEntrySnapshot`,
        // and a binding always has a scope. This line not compiling is the pin.
        container.onResolution(TOKEN, (_instance, snapshot) =>
            seen.push(`${snapshot.kind}:${snapshot.scope}:${snapshot.multi}`)
        )

        container.resolveAll(TOKEN)

        // One attach, two entries, and each notification carries its OWN entry's snapshot.
        expect(seen).toEqual(["value:singleton:true", "class:transient:true"])
    })

    it("pairs the value with the snapshot on every construction of a transient", () => {
        const TOKEN = Symbol("repeating")
        class Service {}
        const pairs: [unknown, string][] = []

        const container = new Container()
        container.register({ provide: TOKEN, useClass: Service, scope: Scope.Transient })
        container.onResolution(TOKEN, (instance, snapshot) => pairs.push([instance, snapshot.kind]))

        const first = container.resolve(TOKEN)
        const second = container.resolve(TOKEN)

        expect(pairs).toEqual([
            [first, "class"],
            [second, "class"],
        ])
        expect(first).not.toBe(second)
    })
})

// The metadata a listener receives
// ========================================
//
// Observation is the fourth door of the metadata plane, so the opaque `metadata` bag arrives here too — on
// the same snapshot, by the same passthrough. This is the door that matters most to an adoption layer: it
// gets the instance AND the policy the registration was written with, in one call, without holding a
// side-table keyed on registrations it does not own.

describe("the metadata a listener receives", () => {
    it("carries the bag the registration was written with", () => {
        const TOKEN = Symbol("described-meta")
        class Service {}
        const seen: EntrySnapshot[] = []

        const container = new Container()
        container.register({ provide: TOKEN, useClass: Service, metadata: { policy: "eager" } })
        container.onResolution(TOKEN, (_instance, snapshot) => seen.push(snapshot))

        container.resolve(TOKEN)

        expect(seen).toEqual([
            { kind: "class", token: TOKEN, scope: "singleton", multi: false, metadata: { policy: "eager" } },
        ])
    })

    it("is the very bag `entry` hands out, frozen and shared", () => {
        const TOKEN = Symbol("shared-meta")
        let reported: EntrySnapshot | undefined

        const container = new Container()
        container.register({ provide: TOKEN, useValue: "v", metadata: { policy: "eager" } })
        container.onResolution(TOKEN, (_instance, snapshot) => {
            reported = snapshot
        })

        container.resolve(TOKEN)

        expect(reported).toEqual(container.entry(TOKEN))
        expect(reported?.metadata).toBe(container.entry(TOKEN)?.metadata)
        expect(Object.isFrozen(reported?.metadata)).toBe(true)
    })

    it("distinguishes two members of one collection by their own bags", () => {
        const TOKEN = Symbol("collection-meta")
        class Transient {}
        const seen: (unknown | undefined)[] = []

        const container = new Container()
        container.register([
            { provide: TOKEN, useValue: "constant", multi: true, metadata: { policy: "eager" } },
            {
                provide: TOKEN,
                useClass: Transient,
                scope: Scope.Transient,
                multi: true,
                metadata: { policy: "lazy" },
            },
        ])

        // One attach, two entries: each notification carries its OWN entry's bag, which is what makes the
        // bag usable as a per-registration policy channel rather than a per-token one.
        container.onResolution(TOKEN, (_instance, snapshot) => seen.push(snapshot.metadata))

        container.resolveAll(TOKEN)

        expect(seen).toEqual([{ policy: "eager" }, { policy: "lazy" }])
    })

    it("is absent on the snapshot when the registration carried none", () => {
        const TOKEN = Symbol("unadorned")
        class Service {}
        let reported: EntrySnapshot | undefined

        const container = new Container()
        container.register({ provide: TOKEN, useClass: Service })
        container.onResolution(TOKEN, (_instance, snapshot) => {
            reported = snapshot
        })

        container.resolve(TOKEN)

        expect(reported && "metadata" in reported).toBe(false)
        expect(reported?.metadata).toBeUndefined()
    })

    it("lets a listener route on the bag without the container having read a key of it", () => {
        // The shape the whole extension point exists for: policy declared at registration, acted on by the
        // layer above at construction time. The container did none of this — it stored a bag and gave it back.
        const TOKEN = Symbol("routed")
        class Eager {}
        class Lazy {}
        const adopted: string[] = []

        const container = new Container()
        container.register([
            { provide: TOKEN, useClass: Eager, multi: true, metadata: { policy: "eager" } },
            { provide: TOKEN, useClass: Lazy, multi: true, metadata: { policy: "lazy" } },
        ])

        container.onResolution(TOKEN, (instance, snapshot) => {
            if (snapshot.metadata?.policy !== "eager") return
            adopted.push((instance as object).constructor.name)
        })

        container.resolveAll(TOKEN)

        expect(adopted).toEqual(["Eager"])
    })
})

// Filtering, in the listener — one observation door
// ========================================
//
// There was briefly an optional `accept` predicate here, run per entry at attach time (itself the merger of
// an earlier `@internal` `onPredicateResolution`). It is GONE (owner ruling). It gated notification and
// never construction, so it prevented nothing a listener cannot decline for itself in its first line — and
// the listener already receives the entry's snapshot as its second argument. What the deletion costs is one
// behavioural difference worth stating outright: a filtered-out entry used to be un-attached, so its
// constructions never reached the listener at all. Now the listener IS called for every construction of
// every non-alias entry of the token, and declines the ones it does not want. The block below pins both
// halves — that it is called, and that self-filtering reaches the same outcomes the predicate did.

describe("filtering inside the listener", () => {
    it("observes every entry when the listener declines nothing", () => {
        const TOKEN = Symbol("unfiltered")
        class Transient {}
        const seen: string[] = []

        const container = new Container()
        container.register([
            { provide: TOKEN, useValue: "constant", multi: true },
            { provide: TOKEN, useClass: Transient, scope: Scope.Transient, multi: true },
        ])
        container.onResolution(TOKEN, (_instance, snapshot) => seen.push(snapshot.kind))

        container.resolveAll(TOKEN)

        expect(seen).toEqual(["value", "class"])
    })

    it("reaches singleton-only adoption by returning early on the transient member", () => {
        const TOKEN = Symbol("filtered")
        class Transient {}
        const seen: unknown[] = []
        const offered: string[] = []

        const container = new Container()
        container.register([
            { provide: TOKEN, useValue: "constant", multi: true },
            { provide: TOKEN, useClass: Transient, scope: Scope.Transient, multi: true },
        ])

        container.onResolution(TOKEN, (instance, snapshot) => {
            offered.push(snapshot.kind)
            if (snapshot.scope !== Scope.Singleton) return
            seen.push(instance)
        })

        // Nothing is offered at attach time any more: the listener is attached to every entry, and each
        // entry speaks only when it builds something.
        expect(offered).toEqual([])

        container.resolveAll(TOKEN)
        container.resolveAll(TOKEN)

        // The listener IS called for the transient member, on every one of its constructions — twice here,
        // against the singleton's single cached construction. That is the shape the predicate hid.
        expect(offered).toEqual(["value", "class", "class"])

        // And the adopted set is unchanged: the early return keeps the transient out of it.
        expect(seen).toEqual(["constant"])
    })

    it("lets a listener decline everything, but still refuses an unowned token", () => {
        const TOKEN = Symbol("nothing")
        class Transient {}
        const seen: unknown[] = []
        let calls = 0

        const container = new Container()
        container.register({ provide: TOKEN, useClass: Transient, scope: Scope.Transient })
        container.onResolution(TOKEN, (instance, snapshot) => {
            calls += 1
            if (snapshot.scope !== Scope.Singleton) return
            seen.push(instance)
        })
        container.resolve(TOKEN)

        // Declining is a listener-side decision, so the listener ran and adopted nothing.
        expect(calls).toBe(1)
        expect(seen).toEqual([])

        // Registration, not filtering, is what attaching is refused over.
        expect(() => container.onResolution(Symbol("absent"), () => {})).toThrowError(
            /nothing is registered for it/
        )
    })

    /**
     * A COMPILE-level pin, and the point of narrowing the parameter. The listener's second argument is
     * declared over `BindingEntrySnapshot`, not the full `EntrySnapshot` union, so `.scope` is reachable
     * straight off a contextually-typed parameter. The adoption filter every layer above writes is therefore
     * the one line below and not `snap.kind !== "alias" && snap.scope === Scope.Singleton` — a guard against
     * a case the container has already excluded, which `typecheck:tests` would now reject as unreachable.
     *
     * Nothing here is asserted at runtime that the tests above do not already assert. What this test buys is
     * that widening the parameter back to `EntrySnapshot` stops the suite compiling.
     */
    it("hands the listener a binding snapshot, so `.scope` reads without narrowing", () => {
        const TOKEN = Symbol("unnarrowed")
        class Transient {}
        const seen: unknown[] = []

        const container = new Container()
        container.register([
            { provide: TOKEN, useValue: "constant", multi: true },
            { provide: TOKEN, useClass: Transient, scope: Scope.Transient, multi: true },
        ])

        container.onResolution(TOKEN, (value, snap) => {
            if (snap.scope === Scope.Singleton) seen.push(value)
        })

        container.resolveAll(TOKEN)

        expect(seen).toEqual(["constant"])
    })

    it("never sees an alias, because an alias is not attachable in the first place", () => {
        const ALIAS = Symbol("aliased")
        class Service {}
        const offered: string[] = []

        const container = new Container()
        container.register([Service, { provide: ALIAS, useExisting: Service }])

        container.onResolution(Service, (_instance, snapshot) => offered.push(snapshot.kind))
        container.resolve(Service)

        expect(offered).toEqual(["class"])
        expect(() => container.onResolution(ALIAS, () => {})).toThrowError(/Cannot observe/)
    })
})

// Multicast — observing never displaces
// ========================================
//
// A binding does not hold ONE handler that each `onResolution` overwrites; it holds a LIST, and the
// container's own dispatcher walks it on every construction. That is what lets the layer above observe a
// token for its own bookkeeping while user code observes the same token afterwards, without either one
// unhooking the other — a failure that would be silent, since a displaced listener throws nothing and
// asserts nothing. Everything below is that dispatcher's contract: who is called, and in what order.

describe("multicast", () => {
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

describe("a listener that resolves", () => {
    // `#notify` runs AFTER the instance is cached and AFTER `runInFrame` has returned. Both halves of that
    // are observable, and neither is obvious from the call site:
    //
    //   cached first  — a listener resolving its own token gets the instance it was just handed, instead of
    //                   recursing into a second construction and notifying itself forever.
    //   frame closed  — for a root read there is no ambient frame during notification, so a listener can
    //                   call `container.resolve()` but not bare `inject()`.

    it("does not recurse when the listener resolves the token it is being notified about", () => {
        class Service {}

        const container = new Container()
        container.register(Service)

        const seen: Service[] = []
        let reentrant: Service | undefined
        container.onResolution(Service, (value) => {
            seen.push(value)
            reentrant = container.resolve(Service)
        })

        const resolved = container.resolve(Service)

        expect(seen).toHaveLength(1)
        expect(reentrant).toBe(resolved)
    })

    it("lets a listener resolve a DIFFERENT token, and notifies for that one too", () => {
        class Other {}
        class Service {}

        const container = new Container()
        container.register([Service, Other])

        const order: string[] = []
        container.onResolution(Other, () => order.push("other"))
        container.onResolution(Service, () => {
            order.push("service")
            container.resolve(Other)
        })

        container.resolve(Service)

        expect(order).toEqual(["service", "other"])
    })

    it("resolves a transient a second time when the listener asks for one", () => {
        // A transient has no cache to short-circuit on, so the listener's read really does construct again —
        // and that construction notifies too. One level, not an infinite regress, because the second
        // instance's listener call is the one that stops asking.
        const TOKEN = Symbol("TRANSIENT")
        class Service {}

        const container = new Container()
        container.register({ provide: TOKEN, useClass: Service, scope: Scope.Transient })

        let built = 0
        container.onResolution(TOKEN, () => {
            built += 1
            if (built === 1) container.resolve(TOKEN)
        })

        container.resolve(TOKEN)

        expect(built).toBe(2)
    })
})
