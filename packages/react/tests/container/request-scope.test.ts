import { describe, expect, it, vi } from "vitest"

import { Container, Scope, inject } from "@remodulo/container"

// Request scope — one instance per resolution graph.
// ========================================
//
// A dependency is read with `inject()` in a field initializer, which runs inside the kernel construction
// frame — so declaration order is read order, exactly as constructor-parameter order used to be.

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

// THE FACTORY BOUNDARY — closed by the kernel.
// ========================================
//
// Under inversify a useFactory dependency was routed by re-entering the public `resolve`, which seeded a
// fresh request cache and so opened the factory own graph. The kernel has no routing layer: a factory
// reads with `inject()` from inside the frame the caller already opened, so the caller graph IS the
// factory graph. These two tests are the inverted pins for that.

describe("the factory boundary", () => {
    it("shares the caller graph with a factory injected dependency", () => {
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
            { provide: FACTORY, useFactory: () => ({ dep: inject<Dep>(DEP) }), scope: Scope.Transient },
            { provide: TOP, useClass: Top, scope: Scope.Transient },
        ])

        const top = container.resolve<Top>(TOP)

        expect(top.viaFactory.dep).toBe(top.viaClass.dep)
    })

    it("gives two factories in one graph the one shared instance", () => {
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
