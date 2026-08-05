import { describe, expect, it, vi } from "vitest"

import { Container } from "../../src/container.js"
import { Scope } from "../../src/container.types.js"
import { inject } from "../../src/injector.js"

// Request scope — one instance per resolution graph.
// ========================================
//
// One instance per ROOT READ: a `resolve`/`resolveAll` that starts outside a construction frame opens a
// fresh request cache, and everything constructed underneath it inherits that cache through the ambient
// frame. No decorators anywhere — every dependency is a bare `inject()` in a field initializer.

const DEP = Symbol("DEP")
const ROOT = Symbol("ROOT")
const PLUGINS = Symbol("PLUGINS")

let built = 0

class Dep {
    readonly serial = ++built
}
class Left {
    readonly dep = inject<Dep>(DEP)
}
class Right {
    readonly dep = inject<Dep>(DEP)
}
class Root {
    readonly left = inject(Left)
    readonly right = inject(Right)
    readonly dep = inject<Dep>(DEP)
}

/** A container whose whole graph is transient except the request-scoped `DEP` every level asks for. */
function graphContainer(): Container {
    const container = new Container()
    container.register([
        { provide: DEP, useClass: Dep, scope: Scope.Request },
        { provide: Left, useClass: Left, scope: Scope.Transient },
        { provide: Right, useClass: Right, scope: Scope.Transient },
        { provide: ROOT, useClass: Root, scope: Scope.Transient },
    ])
    return container
}

describe("sharing", () => {
    it("hands every consumer in one resolve graph the same instance", () => {
        const root = graphContainer().resolve<Root>(ROOT)

        expect(root.left.dep).toBe(root.right.dep)
        expect(root.dep).toBe(root.left.dep)
    })

    it("starts a fresh instance for the next resolve", () => {
        const container = graphContainer()

        const first = container.resolve<Root>(ROOT)
        const second = container.resolve<Root>(ROOT)

        expect(second.left.dep).not.toBe(first.left.dep)
        expect(second.left.dep).toBe(second.right.dep)
    })

    it("gives each direct resolve of the token its own instance — one read is one graph", () => {
        const container = graphContainer()

        expect(container.resolve(DEP)).not.toBe(container.resolve(DEP))
    })

    it("keeps a request-scoped factory to one call per graph", () => {
        const factory = vi.fn(() => ({}))
        const HOLDER_A = Symbol("HOLDER_A")
        const HOLDER_B = Symbol("HOLDER_B")
        const TOP = Symbol("TOP")

        class HolderA {
            readonly made = inject<unknown>(DEP)
        }
        class HolderB {
            readonly made = inject<unknown>(DEP)
        }
        class Top {
            readonly a = inject<HolderA>(HOLDER_A)
            readonly b = inject<HolderB>(HOLDER_B)
        }

        const container = new Container()
        container.register([
            { provide: DEP, useFactory: factory, scope: Scope.Request },
            { provide: HOLDER_A, useClass: HolderA, scope: Scope.Transient },
            { provide: HOLDER_B, useClass: HolderB, scope: Scope.Transient },
            { provide: TOP, useClass: Top, scope: Scope.Transient },
        ])

        const top = container.resolve<Top>(TOP)
        expect(top.a.made).toBe(top.b.made)
        expect(factory).toHaveBeenCalledTimes(1)

        container.resolve<Top>(TOP)
        expect(factory).toHaveBeenCalledTimes(2)
    })

    it("shares across the chain when a child resolves a graph the parent declares", () => {
        const parent = graphContainer()
        const child = parent.fork()

        const root = child.resolve<Root>(ROOT)
        expect(root.left.dep).toBe(root.right.dep)
        expect(child.resolve<Root>(ROOT).left.dep).not.toBe(root.left.dep)
    })
})

// THE FACTORY BOUNDARY, CLOSED.
// ========================================
//
// This block used to pin the opposite of what it pins now, and the change is a fix rather than a decision
// reversed. On inversify a `useFactory` dependency was routed by `Container#resolveDependencies`, which
// re-entered through the public `resolve`/`resolveAll`; the substrate seeded every such entry with an empty
// request cache, so a factory's dependency opened its OWN graph and a request-scoped value reached through
// a factory was NOT the one the caller's classes had. That was a limitation of the substrate — there was no
// way to hand the read the caller's graph, because inversify's `ResolutionContext#get` IS the container's
// public `get`.
//
// The ambient frame closes it. A factory body runs inside `runInFrame`, so an `inject()` in that body reads
// the caller's request cache — and the body is now the only route into a factory, the declarative array
// having been removed. Both tests below assert sharing.

describe("the factory boundary, closed", () => {
    it("shares the caller's graph with a factory body that calls inject() itself", () => {
        const FACTORY = Symbol("FACTORY")
        const TOP = Symbol("TOP")

        class ClassSide {
            readonly dep = inject<Dep>(DEP)
        }
        class Top {
            readonly viaClass = inject(ClassSide)
            readonly viaFactory = inject<{ dep: Dep }>(FACTORY)
        }

        const container = new Container()
        container.register([
            { provide: DEP, useClass: Dep, scope: Scope.Request },
            { provide: ClassSide, useClass: ClassSide, scope: Scope.Transient },
            // The factory body reads the frame directly, the same way a constructor does.
            { provide: FACTORY, useFactory: () => ({ dep: inject<Dep>(DEP) }), scope: Scope.Transient },
            { provide: TOP, useClass: Top, scope: Scope.Transient },
        ])

        const top = container.resolve<Top>(TOP)

        expect(top.viaFactory.dep).toBe(top.viaClass.dep)
    })

    it("gives two factories in one graph the same instance — one graph, not one each", () => {
        const FIRST = Symbol("FIRST")
        const SECOND = Symbol("SECOND")
        const TOP = Symbol("TOP")

        class Top {
            readonly first = inject<{ dep: Dep }>(FIRST)
            readonly second = inject<{ dep: Dep }>(SECOND)
        }

        const container = new Container()
        container.register([
            { provide: DEP, useClass: Dep, scope: Scope.Request },
            { provide: FIRST, useFactory: () => ({ dep: inject<Dep>(DEP) }), scope: Scope.Transient },
            { provide: SECOND, useFactory: () => ({ dep: inject<Dep>(DEP) }), scope: Scope.Transient },
            { provide: TOP, useClass: Top, scope: Scope.Transient },
        ])

        const top = container.resolve<Top>(TOP)

        expect(top.first.dep).toBe(top.second.dep)
    })
})

describe("collections", () => {
    it("shares one instance across every member of a single resolveAll", () => {
        class MemberA {
            readonly dep = inject<Dep>(DEP)
        }
        class MemberB {
            readonly dep = inject<Dep>(DEP)
        }

        const container = new Container()
        container.register([
            { provide: DEP, useClass: Dep, scope: Scope.Request },
            { provide: PLUGINS, useClass: MemberA, multi: true, scope: Scope.Transient },
            { provide: PLUGINS, useClass: MemberB, multi: true, scope: Scope.Transient },
        ])

        const first = container.resolveAll<MemberA | MemberB>(PLUGINS)
        const second = container.resolveAll<MemberA | MemberB>(PLUGINS)

        expect(first[0]?.dep).toBe(first[1]?.dep)
        expect(second[0]?.dep).not.toBe(first[0]?.dep)
    })

    it("rebuilds a request-scoped member per read, like a transient one", () => {
        class Member {}

        const container = new Container()
        container.register([
            { provide: PLUGINS, useClass: Member, multi: true, scope: Scope.Request },
            { provide: PLUGINS, useValue: "constant", multi: true },
        ])

        const first = container.resolveAll(PLUGINS)
        const second = container.resolveAll(PLUGINS)

        expect(first).toHaveLength(2)
        expect(first[0]).not.toBe(second[0])
        expect(first[1]).toBe(second[1])
    })

    it("mixes scopes inside one collection", () => {
        class Singleton {}
        class Requested {}
        class Transient {}

        const container = new Container()
        container.register([
            { provide: PLUGINS, useClass: Singleton, multi: true },
            { provide: PLUGINS, useClass: Requested, multi: true, scope: Scope.Request },
            { provide: PLUGINS, useClass: Transient, multi: true, scope: Scope.Transient },
        ])

        const first = container.resolveAll(PLUGINS)
        const second = container.resolveAll(PLUGINS)

        expect(first[0]).toBe(second[0])
        expect(first[1]).not.toBe(second[1])
        expect(first[2]).not.toBe(second[2])
    })
})

describe("container.resolve() called inside a factory body", () => {
    // The subtle one. `inject()` obviously joins the running graph — that is what it is for. A direct
    // `container.resolve()` from inside a factory body looks like it should start a FRESH graph, because it
    // is called on a container rather than on the frame, and nothing in the call spelling mentions the read
    // in progress.
    //
    // It joins the running graph anyway, and that is deliberate: `#context()` reads the ambient frame, so
    // every read inherits the active request cache and the active cycle chain regardless of which door it
    // came through. The alternative — resolve() opening a second cache mid-graph — would hand one graph two
    // different instances of the same request-scoped binding depending on which function asked.

    it("joins the active graph's request cache rather than opening a second one", () => {
        class Shared {}
        const ROOT = Symbol("ROOT")

        const container = new Container()
        container.register({ provide: Shared, useClass: Shared, scope: Scope.Request })

        let viaInject: Shared | undefined
        let viaResolve: Shared | undefined
        container.register({
            provide: ROOT,
            scope: Scope.Transient,
            useFactory: () => {
                viaInject = inject(Shared)
                viaResolve = container.resolve(Shared)
                return { viaInject, viaResolve }
            },
        })

        container.resolve(ROOT)

        expect(viaInject).toBeInstanceOf(Shared)
        expect(viaResolve).toBe(viaInject)
    })

    it("still starts a fresh graph for the NEXT root read", () => {
        // Joining the active graph is scoped to the graph, not sticky: two root reads stay two graphs.
        class Shared {}
        const ROOT = Symbol("ROOT")

        const container = new Container()
        container.register({ provide: Shared, useClass: Shared, scope: Scope.Request })
        container.register({
            provide: ROOT,
            scope: Scope.Transient,
            useFactory: () => ({ shared: container.resolve<Shared>(Shared) }),
        })

        const first = container.resolve<{ shared: Shared }>(ROOT)
        const second = container.resolve<{ shared: Shared }>(ROOT)

        expect(first.shared).not.toBe(second.shared)
    })

    it("inherits the cycle chain too, so a factory cannot resolve its way around a cycle", () => {
        // The same inheritance seen from its other side: if `resolve()` opened a fresh context it would also
        // get a fresh empty `chain`, and this would recurse until the stack gave out instead of throwing.
        const LOOP = Symbol("LOOP")

        const container = new Container()
        container.register({ provide: LOOP, useFactory: () => container.resolve(LOOP) })

        expect(() => container.resolve(LOOP)).toThrow(/Circular dependency found/)
    })
})
