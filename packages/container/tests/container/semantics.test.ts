import { describe, expect, it } from "vitest"

import { Container } from "../../src/container.js"
import type { Constructor, InjectionToken } from "../../src/container.types.js"
import { inject } from "../../src/injector.js"

// Provider semantics under pressure.
// ========================================
//
// The headline is the first block: a singleton is per-CONTAINER, never global. After it, the two things a
// container has to get right about construction — deep dependency chains and the diamond that shares a leaf
// — and the two hard failure modes: a circular dependency, and a constructor that throws.
//
// No decorators: every dependency below is a bare `inject()` evaluated at construction time.

// Helpers
// ========================================

type Instance = {
    readonly label: string
    readonly serial: number
    /** Whatever was injected, positionally — the chain tests assert identity through it. */
    readonly deps: readonly unknown[]
}

type Instrumented = Constructor<Instance> & { readonly instances: readonly Instance[] }

/**
 * A class that keeps every instance it ever builds and records its own construction in `log`. `dependencies`
 * are injected in the constructor BODY, so the entry lands in `log` only once everything below it is built —
 * which is what makes the log a construction ORDER, innermost first.
 */
function instrumented(label: string, log: string[], dependencies: InjectionToken[] = []): Instrumented {
    const instances: Instance[] = []

    const Service = class {
        static readonly instances = instances

        readonly label = label
        readonly serial: number
        readonly deps: readonly unknown[]

        constructor() {
            this.deps = dependencies.map((token) => inject(token))
            this.serial = instances.length + 1
            instances.push(this as unknown as Instance)
            log.push(`${label}#${this.serial}:ctor`)
        }
    }

    return Service as unknown as Instrumented
}

// Singleton is per-container, never global
// ========================================
//
// "Singleton" in this library means one instance per container that DECLARES the provider — it is a
// property of the binding's owner, not of the class. The same class registered twice is two singletons;
// registered once and reached from ten descendants is one. Nothing is memoized on the class itself.

describe("singleton scope is per-container", () => {
    it("gives two sibling forks of one container an instance each for the same class", () => {
        const log: string[] = []
        const Service = instrumented("S", log)

        const root = new Container()
        const left = root.fork()
        const right = root.fork()
        left.register(Service)
        right.register(Service)

        const fromLeft = left.resolve(Service)
        const fromRight = right.resolve(Service)

        expect(fromLeft).toBeInstanceOf(Service)
        expect(fromRight).toBeInstanceOf(Service)
        expect(fromRight).not.toBe(fromLeft)
        expect(Service.instances).toEqual([fromLeft, fromRight])
        // The root declared nothing, so it owns neither of them.
        expect(root.isRegistered(Service)).toBe(false)
    })
})

// Constructor dependency chains
// ========================================

describe("constructor dependency chains", () => {
    const A = Symbol.for("tests.semantics.chain.a")
    const B = Symbol.for("tests.semantics.chain.b")
    const C = Symbol.for("tests.semantics.chain.c")
    const D = Symbol.for("tests.semantics.chain.d")

    it("builds a four-deep chain once each, innermost first", () => {
        const log: string[] = []
        // A -> B -> C -> D. Deliberately DECLARED dependent-first, so declaration order and construction
        // order disagree and the assertions below are about construction, not about the provider list.
        const Alpha = instrumented("A", log, [B])
        const Beta = instrumented("B", log, [C])
        const Gamma = instrumented("C", log, [D])
        const Delta = instrumented("D", log)

        const container = new Container()
        container.register([
            { provide: A, useClass: Alpha },
            { provide: B, useClass: Beta },
            { provide: C, useClass: Gamma },
            { provide: D, useClass: Delta },
        ])

        const alpha = container.resolve<Instance>(A)

        // Every link built exactly once, and the chain is wired to those same instances.
        for (const link of [Alpha, Beta, Gamma, Delta]) expect(link.instances).toHaveLength(1)
        expect(alpha).toBe(Alpha.instances[0])
        expect(Alpha.instances[0]?.deps[0]).toBe(Beta.instances[0])
        expect(Beta.instances[0]?.deps[0]).toBe(Gamma.instances[0])
        expect(Gamma.instances[0]?.deps[0]).toBe(Delta.instances[0])

        // Construction runs innermost-first, whatever order the providers were declared in.
        expect(log).toEqual(["D#1:ctor", "C#1:ctor", "B#1:ctor", "A#1:ctor"])
    })

    it("builds a shared leaf of a diamond once and hands both arms the same instance", () => {
        const log: string[] = []
        const Top = instrumented("Top", log, [B, C])
        const Left = instrumented("L", log, [D])
        const Right = instrumented("R", log, [D])
        const Leaf = instrumented("Leaf", log)

        const container = new Container()
        container.register([
            { provide: A, useClass: Top },
            { provide: B, useClass: Left },
            { provide: C, useClass: Right },
            { provide: D, useClass: Leaf },
        ])

        container.resolve<Instance>(A)

        expect(Leaf.instances).toHaveLength(1)
        expect(Top.instances[0]?.deps).toEqual([Left.instances[0], Right.instances[0]])
        expect(Left.instances[0]?.deps[0]).toBe(Leaf.instances[0])
        expect(Right.instances[0]?.deps[0]).toBe(Leaf.instances[0])

        // The shared leaf is built once, even though two dependents pulled it in.
        expect(log).toEqual(["Leaf#1:ctor", "L#1:ctor", "R#1:ctor", "Top#1:ctor"])
    })
})

// Circular dependencies
// ========================================
//
// UNSUPPORTED BY DESIGN, permanently. A constructor cycle is a structural mistake in the consuming app, not
// a case the container is expected to absorb, and no Delay-style escape hatch will be built. Throwing
// loudly IS the contract, so the tests below pin the exact text from either end. What changed with the move
// off inversify is only the provenance: `#assertAcyclic` walks the frame's own chain and throws a plain
// `Error` from this package's error catalog, so there is no vendor error class to match on any more.
//
// `LazyToken` is gone with the decorators. It wrapped inversify's `LazyServiceIdentifier` to defer
// evaluation of an IDENTIFIER named in a decorator, which ran at class-definition time; `inject()` sits in
// a field initializer that runs at CONSTRUCTION time, so the TDZ problem it existed for cannot occur —
// pinned by the last test in this block.

describe("circular dependencies", () => {
    /** Alpha <-> Beta, each reaching for the other from a field initializer. */
    function cycle(): { container: Container; Alpha: Constructor; Beta: Constructor } {
        class Alpha {
            readonly beta = inject(Beta)
        }
        class Beta {
            readonly alpha = inject(Alpha)
        }

        const container = new Container()
        container.register([Alpha, Beta])
        return { container, Alpha, Beta }
    }

    it("throws the circular-dependency error, naming the whole path", () => {
        const { container, Alpha } = cycle()

        // The message walks the cycle back to its start rather than just naming the pair.
        expect(() => container.resolve(Alpha)).toThrowError("Circular dependency found: Alpha -> Beta -> Alpha")

        const thrown = (() => {
            try {
                container.resolve(Alpha)
                return null
            } catch (error) {
                return error as Error
            }
        })()
        // Ours, not a vendor's — and named now rather than anonymous: `CycleError` carries a message from
        // `container.errors.ts`. The full hierarchy is pinned in `tests/container/errors.test.ts`.
        expect(thrown).toBeInstanceOf(Error)
        expect(thrown?.constructor.name).toBe("CycleError")
    })

    it("reports the cycle from whichever end asked for it", () => {
        const { container, Beta } = cycle()

        expect(() => container.resolve(Beta)).toThrowError("Circular dependency found: Beta -> Alpha -> Beta")
    })

    it("needs no lazy wrapper for a token whose class is declared later", () => {
        class Consumer {
            // Under decorators this was the TDZ case: `@Inject(Later)` evaluated `Later` while the class
            // was still in its temporal dead zone. A field initializer runs at construction, long after.
            readonly later = inject(Later)
        }

        class Later {
            readonly kind = "later"
        }

        const container = new Container()
        container.register([Consumer, Later])

        expect(container.resolve(Consumer).later).toBeInstanceOf(Later)
    })
})

// Construction failures
// ========================================
//
// The circular case is one instance of the general rule, pinned here generally: a provider whose
// construction throws sends the original error straight out of `resolve`, unwrapped — and leaves nothing
// behind, because the frame is installed and removed in a `try/finally`.

describe("a provider constructor that throws", () => {
    const THROWS = Symbol.for("tests.semantics.throws")

    class Exploding {
        constructor() {
            throw new Error("boom from a constructor")
        }
    }

    it("propagates the original error out of resolve unwrapped", () => {
        const container = new Container()
        container.register({ provide: THROWS, useClass: Exploding })

        expect(() => container.resolve(THROWS)).toThrowError("boom from a constructor")
    })

    it("restores the frame afterwards, so the next read starts from a clean one", () => {
        class Dependency {
            readonly kind = "dependency"
        }
        class Consumer {
            readonly dependency = inject(Dependency)
        }

        const container = new Container()
        container.register([{ provide: THROWS, useClass: Exploding }, Dependency, Consumer])

        expect(() => container.resolve(THROWS)).toThrowError("boom from a constructor")

        // A leaked frame would still carry THROWS in its chain, so this second read would report a
        // circular dependency instead of the constructor's own error.
        expect(() => container.resolve(THROWS)).toThrowError("boom from a constructor")

        // And an unrelated graph still builds and injects normally.
        const consumer = container.resolve(Consumer)
        expect(consumer.dependency).toBeInstanceOf(Dependency)
        expect(consumer.dependency).toBe(container.resolve(Dependency))
    })
})
