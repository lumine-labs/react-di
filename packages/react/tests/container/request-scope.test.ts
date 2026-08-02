import { describe, expect, it, vi } from "vitest"

import { Container, Inject, Injectable, Scope, decorate } from "../../src/container/index.js"
import type { Constructor } from "../../src/container/index.js"

// Request scope — one instance per resolution graph.
// ========================================
//
// vitest transforms with esbuild, which emits no `design:paramtypes`: every class goes through
// `decorate(Injectable(), …)` and every constructor parameter through `decorate(Inject(TOKEN), …, i)`.
//
// Probed in scratch/probe-request-1-inversify.ts (substrate) and
// scratch/probe-request-3-scope-treatment.ts (through this container).

function injectableClass<T extends Constructor>(target: T): T {
    decorate(Injectable(), target)
    return target
}

function injectParam(target: Constructor, token: Parameters<typeof Inject>[0], index: number): void {
    decorate(Inject(token) as ParameterDecorator, target, index)
}

const DEP = Symbol("DEP")
const ROOT = Symbol("ROOT")
const PLUGINS = Symbol("PLUGINS")

let built = 0

class Dep {
    readonly serial = ++built
}
class Left {
    constructor(readonly dep: Dep) {}
}
class Right {
    constructor(readonly dep: Dep) {}
}
class Root {
    constructor(
        readonly left: Left,
        readonly right: Right,
        readonly dep: Dep
    ) {}
}

injectableClass(Dep)
injectableClass(Left)
injectableClass(Right)
injectableClass(Root)
injectParam(Left, DEP, 0)
injectParam(Right, DEP, 0)
injectParam(Root, Left, 0)
injectParam(Root, Right, 1)
injectParam(Root, DEP, 2)

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
            constructor(readonly made: unknown) {}
        }
        class HolderB {
            constructor(readonly made: unknown) {}
        }
        class Top {
            constructor(
                readonly a: HolderA,
                readonly b: HolderB
            ) {}
        }
        injectableClass(HolderA)
        injectableClass(HolderB)
        injectableClass(Top)
        injectParam(HolderA, DEP, 0)
        injectParam(HolderB, DEP, 0)
        injectParam(Top, HOLDER_A, 0)
        injectParam(Top, HOLDER_B, 1)

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

// THE FACTORY BOUNDARY — a MEASURED limitation, not a decision.
// ========================================
//
// MEASURED, inversify 8.2.3 (scratch/probe-request-2-factory-boundary.ts): a `useFactory` dependency is
// routed by `Container#resolveDependencies`, which re-enters through `resolve`/`resolveAll` — and the
// substrate seeds every entry with an empty request cache, so the read opens its OWN graph. Routing the
// same read through inversify's `ResolutionContext` instead does not help: that context's `get` IS the
// container's public `get`. This suite pins the behaviour as it is; fixing it is upstream work.

describe("the factory boundary", () => {
    it("does not share the caller's graph with a factory's injected dependency", () => {
        const FACTORY = Symbol("FACTORY")
        const TOP = Symbol("TOP")

        class ClassSide {
            constructor(readonly dep: Dep) {}
        }
        class Top {
            constructor(
                readonly viaClass: ClassSide,
                readonly viaFactory: { dep: Dep }
            ) {}
        }
        injectableClass(ClassSide)
        injectableClass(Top)
        injectParam(ClassSide, DEP, 0)
        injectParam(Top, ClassSide, 0)
        injectParam(Top, FACTORY, 1)

        const container = new Container()
        container.register([
            { provide: DEP, useClass: Dep, scope: Scope.Request },
            { provide: ClassSide, useClass: ClassSide, scope: Scope.Transient },
            { provide: FACTORY, useFactory: (dep: Dep) => ({ dep }), inject: [DEP], scope: Scope.Transient },
            { provide: TOP, useClass: Top, scope: Scope.Transient },
        ])

        const top = container.resolve<Top>(TOP)

        expect(top.viaFactory.dep).not.toBe(top.viaClass.dep)
    })

    it("gives two factories in one graph two instances, one graph each", () => {
        const FIRST = Symbol("FIRST")
        const SECOND = Symbol("SECOND")
        const TOP = Symbol("TOP")

        class Top {
            constructor(
                readonly first: { dep: Dep },
                readonly second: { dep: Dep }
            ) {}
        }
        injectableClass(Top)
        injectParam(Top, FIRST, 0)
        injectParam(Top, SECOND, 1)

        const container = new Container()
        container.register([
            { provide: DEP, useClass: Dep, scope: Scope.Request },
            { provide: FIRST, useFactory: (dep: Dep) => ({ dep }), inject: [DEP], scope: Scope.Transient },
            { provide: SECOND, useFactory: (dep: Dep) => ({ dep }), inject: [DEP], scope: Scope.Transient },
            { provide: TOP, useClass: Top, scope: Scope.Transient },
        ])

        const top = container.resolve<Top>(TOP)

        expect(top.first.dep).not.toBe(top.second.dep)
    })
})

describe("collections", () => {
    it("shares one instance across every member of a single resolveAll", () => {
        class MemberA {
            constructor(readonly dep: Dep) {}
        }
        class MemberB {
            constructor(readonly dep: Dep) {}
        }
        injectableClass(MemberA)
        injectableClass(MemberB)
        injectParam(MemberA, DEP, 0)
        injectParam(MemberB, DEP, 0)

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
        injectableClass(Member)

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
        injectableClass(Singleton)
        injectableClass(Requested)
        injectableClass(Transient)

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
