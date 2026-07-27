import { describe, expect, it, vi } from "vitest"

import { Container, Inject, Injectable, Scope, decorate } from "../../src/container/index.js"
import type { Constructor, Provider } from "../../src/container/index.js"

// The five provider shapes and the two scopes.
// ========================================
//
// vitest transforms with esbuild, which emits no `design:paramtypes`: every class goes through
// `decorate(Injectable(), …)` and every constructor parameter through `decorate(Inject(TOKEN), …, i)`.

function injectableClass<T extends Constructor>(target: T): T {
    decorate(Injectable(), target)
    return target
}

function injectParam(target: Constructor, token: Parameters<typeof Inject>[0], index: number): void {
    decorate(Inject(token) as ParameterDecorator, target, index)
}

describe("provider shapes", () => {
    it("registers a bare constructor as itself, singleton by default", () => {
        const built: string[] = []
        class Service {
            constructor() {
                built.push("Service")
            }
        }
        injectableClass(Service)

        const container = new Container()
        container.register(Service)

        const first = container.resolve(Service)
        const second = container.resolve(Service)

        expect(first).toBeInstanceOf(Service)
        expect(second).toBe(first)
        expect(built).toEqual(["Service"])
    })

    it("registers useClass under a foreign token", () => {
        class Impl {
            readonly kind = "impl"
        }
        injectableClass(Impl)
        const TOKEN = Symbol("service")

        const container = new Container()
        container.register({ provide: TOKEN, useClass: Impl })

        const resolved = container.resolve<Impl>(TOKEN)
        expect(resolved).toBeInstanceOf(Impl)
        expect(resolved.kind).toBe("impl")
        // The implementation class is not itself a token.
        expect(container.isRegistered(Impl)).toBe(false)
    })

    it("registers useValue and hands back the very same object", () => {
        const value = { retries: 2 }
        const TOKEN = Symbol("config")

        const container = new Container()
        container.register({ provide: TOKEN, useValue: value })

        expect(container.resolve(TOKEN)).toBe(value)
        expect(container.resolve(TOKEN)).toBe(value)
    })

    it("registers useValue for primitives, including falsy ones", () => {
        const ZERO = Symbol("zero")
        const EMPTY = Symbol("empty")
        const FALSE = Symbol("false")

        const container = new Container()
        container.register([
            { provide: ZERO, useValue: 0 },
            { provide: EMPTY, useValue: "" },
            { provide: FALSE, useValue: false },
        ])

        expect([container.resolve(ZERO), container.resolve(EMPTY), container.resolve(FALSE)]).toEqual([0, "", false])
    })

    it("registers useFactory with no dependencies and calls it once per singleton", () => {
        const factory = vi.fn(() => ({ id: 1 }))
        const TOKEN = Symbol("factory")

        const container = new Container()
        container.register({ provide: TOKEN, useFactory: factory })

        const first = container.resolve(TOKEN)
        const second = container.resolve(TOKEN)

        expect(first).toBe(second)
        expect(factory).toHaveBeenCalledTimes(1)
    })

    it("resolves useFactory `inject` dependencies in declaration order", () => {
        class Dependency {
            readonly kind = "dependency"
        }
        injectableClass(Dependency)
        const NAME = Symbol("name")
        const TOKEN = Symbol("factory-with-deps")

        const factory = vi.fn((name: string, dependency: Dependency) => ({ name, dependency }))

        const container = new Container()
        container.register([
            { provide: NAME, useValue: "alpha" },
            Dependency,
            { provide: TOKEN, useFactory: factory, inject: [NAME, Dependency] },
        ])

        const resolved = container.resolve<{ name: string; dependency: Dependency }>(TOKEN)

        expect(resolved.name).toBe("alpha")
        expect(resolved.dependency).toBeInstanceOf(Dependency)
        expect(factory).toHaveBeenCalledTimes(1)
        expect(factory.mock.calls[0]?.[0]).toBe("alpha")
    })

    it("passes undefined for a missing `{ token, optional: true }` dependency", () => {
        const MISSING = Symbol("missing")
        const TOKEN = Symbol("optional-factory")
        const factory = vi.fn((value: unknown) => ({ value }))

        const container = new Container()
        container.register({ provide: TOKEN, useFactory: factory, inject: [{ token: MISSING, optional: true }] })

        expect(container.resolve<{ value: unknown }>(TOKEN)).toEqual({ value: undefined })
        expect(factory).toHaveBeenCalledWith(undefined)
    })

    it("passes the real value for a present `{ token, optional: true }` dependency", () => {
        const PRESENT = Symbol("present")
        const TOKEN = Symbol("optional-factory-hit")

        const container = new Container()
        container.register([
            { provide: PRESENT, useValue: "here" },
            {
                provide: TOKEN,
                useFactory: (value: unknown) => ({ value }),
                inject: [{ token: PRESENT, optional: true }],
            },
        ])

        expect(container.resolve<{ value: unknown }>(TOKEN)).toEqual({ value: "here" })
    })

    it("throws when a non-optional factory dependency is missing", () => {
        const MISSING = Symbol("required-missing")
        const TOKEN = Symbol("strict-factory")

        const container = new Container()
        container.register({ provide: TOKEN, useFactory: (value: unknown) => value, inject: [MISSING] })

        expect(() => container.resolve(TOKEN)).toThrow(/required-missing/)
    })

    it("registers useExisting as an alias onto the target instance", () => {
        class Service {
            readonly kind = "service"
        }
        injectableClass(Service)
        const ALIAS = Symbol("alias")

        const container = new Container()
        container.register([Service, { provide: ALIAS, useExisting: Service }])

        expect(container.resolve(ALIAS)).toBe(container.resolve(Service))
    })

    it("aliases a useValue target without copying it", () => {
        const value = { shared: true }
        const TARGET = Symbol("target")
        const ALIAS = Symbol("alias")

        const container = new Container()
        container.register([
            { provide: TARGET, useValue: value },
            { provide: ALIAS, useExisting: TARGET },
        ])

        expect(container.resolve(ALIAS)).toBe(value)
    })

    it("injects constructor parameters declared with Inject", () => {
        class Dependency {
            readonly kind = "dependency"
        }
        injectableClass(Dependency)

        class Consumer {
            constructor(readonly dependency: Dependency) {}
        }
        injectableClass(Consumer)
        injectParam(Consumer, Dependency, 0)

        const container = new Container()
        container.register([Dependency, Consumer])

        expect(container.resolve(Consumer).dependency).toBe(container.resolve(Dependency))
    })

    it("registers an array of providers in one call", () => {
        class A {}
        class B {}
        injectableClass(A)
        injectableClass(B)

        const container = new Container()
        container.register([A, { provide: B, useClass: B }])

        expect(container.resolve(A)).toBeInstanceOf(A)
        expect(container.resolve(B)).toBeInstanceOf(B)
    })
})

describe("scopes", () => {
    it("defaults a class provider to singleton", () => {
        const built: number[] = []
        class Service {
            constructor() {
                built.push(built.length)
            }
        }
        injectableClass(Service)
        const TOKEN = Symbol("scoped")

        const container = new Container()
        container.register({ provide: TOKEN, useClass: Service })

        expect(container.resolve(TOKEN)).toBe(container.resolve(TOKEN))
        expect(built).toHaveLength(1)
    })

    it("builds a fresh instance per resolve for Scope.Transient", () => {
        const built: string[] = []
        class Service {
            constructor() {
                built.push("built")
            }
        }
        injectableClass(Service)
        const TOKEN = Symbol("transient")

        const container = new Container()
        container.register({ provide: TOKEN, useClass: Service, scope: Scope.Transient })

        const first = container.resolve(TOKEN)
        const second = container.resolve(TOKEN)
        const third = container.resolve(TOKEN)

        expect(first).not.toBe(second)
        expect(second).not.toBe(third)
        expect(built).toHaveLength(3)
    })

    it("honours Scope.Singleton written out explicitly", () => {
        class Service {}
        injectableClass(Service)
        const TOKEN = Symbol("explicit-singleton")

        const container = new Container()
        container.register({ provide: TOKEN, useClass: Service, scope: Scope.Singleton })

        expect(container.resolve(TOKEN)).toBe(container.resolve(TOKEN))
    })

    it("applies scope to factory providers too", () => {
        const singleton = vi.fn(() => ({}))
        const transient = vi.fn(() => ({}))
        const SINGLETON = Symbol("factory-singleton")
        const TRANSIENT = Symbol("factory-transient")

        const container = new Container()
        container.register([
            { provide: SINGLETON, useFactory: singleton, scope: Scope.Singleton },
            { provide: TRANSIENT, useFactory: transient, scope: Scope.Transient },
        ])

        container.resolve(SINGLETON)
        container.resolve(SINGLETON)
        const first = container.resolve(TRANSIENT)
        const second = container.resolve(TRANSIENT)

        expect(singleton).toHaveBeenCalledTimes(1)
        expect(transient).toHaveBeenCalledTimes(2)
        expect(first).not.toBe(second)
    })

    it("keeps one singleton instance for the container that declares it, across the whole chain", () => {
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
        const grandchild = child.fork()

        expect(grandchild.resolve(Service)).toBe(root.resolve(Service))
        expect(child.resolve(Service)).toBe(root.resolve(Service))
        expect(built).toHaveLength(1)
    })

    it("exposes exactly two scopes", () => {
        expect(Object.keys(Scope).sort()).toEqual(["Singleton", "Transient"])
        expect([Scope.Singleton, Scope.Transient]).toEqual(["singleton", "transient"])
    })
})

describe("invalid providers", () => {
    it("rejects `{ provide }` with no use* key", () => {
        const TOKEN = Symbol("no-use")
        const container = new Container()

        expect(() => container.register({ provide: TOKEN } as unknown as Provider)).toThrow(
            /Provider for no-use has no recognised form/
        )
    })

    it("rejects a typo'd use* key", () => {
        const TOKEN = Symbol("typo")
        const container = new Container()

        expect(() => container.register({ provide: TOKEN, useKlass: class {} } as unknown as Provider)).toThrow(
            /has no recognised form/
        )
    })

    it("rejects a bare object with no `provide`", () => {
        const container = new Container()

        expect(() => container.register({} as unknown as Provider)).toThrow(
            /^Provider has no recognised form — expected a class, or an object with one of useClass, useValue, useFactory or useExisting\.$/
        )
    })

    it("rejects null", () => {
        const container = new Container()

        expect(() => container.register(null as unknown as Provider)).toThrow(/^Provider null has no recognised form/)
    })

    it("rejects primitives", () => {
        const container = new Container()

        expect(() => container.register(42 as unknown as Provider)).toThrow(/^Provider 42 has no recognised form/)
        expect(() => container.register("nope" as unknown as Provider)).toThrow(/^Provider nope has no recognised form/)
    })

    it("names a class token in the error message", () => {
        class Widget {}
        const container = new Container()

        expect(() => container.register({ provide: Widget } as unknown as Provider)).toThrow(/Provider for Widget/)
    })
})
