// eslint-disable-next-line max-classes-per-file
import { describe, expect, it, vi } from "vitest"
import { Container, Scope } from "../../src/aliases/index.js"
import { registerProvider, registerProviders } from "../../src/core/providers/providers.js"
import type { ClassProvider, FactoryProvider, ProviderScope } from "../../src/core/providers/providers.types.js"

class ServiceA {}
class ServiceB {}
class ImplService {
    readonly kind = "impl"
}

describe("registerProvider", () => {
    it("registers constructor providers as singletons by default", () => {
        const container = Container.createChildContainer()

        registerProvider(container, ServiceA)

        const a1 = container.resolve(ServiceA)
        const a2 = container.resolve(ServiceA)
        expect(a1).toBe(a2)
    })

    it("registers class providers with scope", () => {
        const container = Container.createChildContainer()

        registerProvider(container, {
            provide: ServiceA,
            useClass: ServiceA,
            scope: "transient",
        })

        const a1 = container.resolve(ServiceA)
        const a2 = container.resolve(ServiceA)
        expect(a1).not.toBe(a2)
    })

    it("registers value providers", () => {
        const container = Container.createChildContainer()
        const token = Symbol.for("tests:value")

        registerProvider(container, {
            provide: token,
            useValue: { ok: true },
        })

        expect(container.resolve<{ ok: boolean }>(token)).toEqual({ ok: true })
    })

    it("registers existing providers as token aliases", () => {
        const container = Container.createChildContainer()
        const source = Symbol.for("tests:source")
        const target = Symbol.for("tests:target")

        registerProvider(container, { provide: source, useValue: 123 })
        registerProvider(container, { provide: target, useExisting: source })

        expect(container.resolve<number>(target)).toBe(123)
    })

    it("registers factory providers and resolves injected dependencies", () => {
        const container = Container.createChildContainer()
        const token = Symbol.for("tests:factory-with-deps")
        container.register(ServiceA, { useValue: new ServiceA() })

        const factory = vi.fn((a: ServiceA, optional?: ServiceB) => ({ a, optional }))
        registerProvider(container, {
            provide: token,
            useFactory: factory,
            inject: [ServiceA, { token: ServiceB, optional: true }],
        })

        const resolved = container.resolve<{ a: ServiceA; optional?: ServiceB }>(token)
        expect(resolved.a).toBeInstanceOf(ServiceA)
        expect(resolved.optional).toBeUndefined()
        expect(factory).toHaveBeenCalledTimes(1)
    })

    it("supports singleton/transient for factory providers", () => {
        const tokenSingleton = Symbol.for("tests:factory-singleton")
        const tokenTransient = Symbol.for("tests:factory-transient")
        const root = Container.createChildContainer()

        registerProvider(root, {
            provide: tokenSingleton,
            useFactory: () => new ImplService(),
            scope: "singleton",
        })
        registerProvider(root, {
            provide: tokenTransient,
            useFactory: () => new ImplService(),
            scope: "transient",
        })

        const rootSingleton1 = root.resolve<ImplService>(tokenSingleton)
        const rootSingleton2 = root.resolve<ImplService>(tokenSingleton)
        expect(rootSingleton1).toBe(rootSingleton2)

        const rootTransient1 = root.resolve<ImplService>(tokenTransient)
        const rootTransient2 = root.resolve<ImplService>(tokenTransient)
        expect(rootTransient1).not.toBe(rootTransient2)

        // A singleton factory registration is shared down the container chain — one instance, one owner.
        const child = root.createChildContainer()
        expect(child.resolve<ImplService>(tokenSingleton)).toBe(rootSingleton1)
    })

    it("keeps a factory singleton bound to the declaring registration across child containers", () => {
        const token = Symbol.for("tests:factory-singleton-chain")
        const root = Container.createChildContainer()
        const built: ImplService[] = []

        registerProvider(root, {
            provide: token,
            useFactory: () => {
                const instance = new ImplService()
                built.push(instance)
                return instance
            },
        })

        const grandchild = root.createChildContainer().createChildContainer()
        const fromGrandchild = grandchild.resolve<ImplService>(token)
        const fromRoot = root.resolve<ImplService>(token)

        expect(fromGrandchild).toBe(fromRoot)
        expect(built).toHaveLength(1)
    })
})

// Scope model — the deleted string scopes must not typecheck (D35).
// ========================================
// `npm run test` cannot fail on these; `npm run typecheck:tests` is the gate. A directive that stops
// being needed is itself an error, so a re-introduced scope breaks this block.

describe("scope model", () => {
    it("rejects containerScoped and resolutionScoped at compile time", () => {
        const classProvider: ClassProvider<ImplService> = {
            provide: ImplService,
            useClass: ImplService,
            // @ts-expect-error containerScoped was removed from the scope model
            scope: "containerScoped",
        }

        const factoryProvider: FactoryProvider<ImplService> = {
            provide: Symbol.for("tests:factory-ts-scope"),
            useFactory: () => new ImplService(),
            // @ts-expect-error resolutionScoped was removed from the scope model
            scope: "resolutionScoped",
        }

        // @ts-expect-error ProviderScope is "singleton" | "transient" | Scope
        const containerScoped: ProviderScope = "containerScoped"
        // @ts-expect-error ProviderScope is "singleton" | "transient" | Scope
        const resolutionScoped: ProviderScope = "resolutionScoped"

        expect([classProvider.scope, factoryProvider.scope, containerScoped, resolutionScoped]).toEqual([
            "containerScoped",
            "resolutionScoped",
            "containerScoped",
            "resolutionScoped",
        ])
    })

    it("exposes exactly two Scope values", () => {
        expect(Object.keys(Scope).sort()).toEqual(["Singleton", "Transient"])
    })
})

describe("registerProviders", () => {
    it("registers provider arrays in order", () => {
        const container = Container.createChildContainer()

        registerProviders(container, [ServiceA, { provide: ServiceB, useClass: ServiceB }])

        expect(container.resolve(ServiceA)).toBeInstanceOf(ServiceA)
        expect(container.resolve(ServiceB)).toBeInstanceOf(ServiceB)
    })

    it("keeps last registration when same token is provided multiple times", () => {
        const container = Container.createChildContainer()
        const token = Symbol.for("tests:providers:order-override")

        registerProviders(container, [
            { provide: token, useValue: "first" },
            { provide: token, useValue: "second" },
        ])

        expect(container.resolve<string>(token)).toBe("second")
    })
})
