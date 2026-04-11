// eslint-disable-next-line max-classes-per-file
import { describe, expect, it, vi } from "vitest"
import { Container } from "../../src/aliases/index.js"
import { registerProvider, registerProviders } from "../../src/providers/providers.js"

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

    it("supports singleton/containerScoped/transient for factory providers", () => {
        const tokenSingleton = Symbol.for("tests:factory-singleton")
        const tokenScoped = Symbol.for("tests:factory-scoped")
        const tokenTransient = Symbol.for("tests:factory-transient")
        const root = Container.createChildContainer()

        registerProvider(root, {
            provide: tokenSingleton,
            useFactory: () => new ImplService(),
            scope: "singleton",
        })
        registerProvider(root, {
            provide: tokenScoped,
            useFactory: () => new ImplService(),
            scope: "containerScoped",
        })
        registerProvider(root, {
            provide: tokenTransient,
            useFactory: () => new ImplService(),
            scope: "transient",
        })

        const rootSingleton1 = root.resolve<ImplService>(tokenSingleton)
        const rootSingleton2 = root.resolve<ImplService>(tokenSingleton)
        expect(rootSingleton1).toBe(rootSingleton2)

        const rootScoped1 = root.resolve<ImplService>(tokenScoped)
        const rootScoped2 = root.resolve<ImplService>(tokenScoped)
        expect(rootScoped1).toBe(rootScoped2)

        const rootTransient1 = root.resolve<ImplService>(tokenTransient)
        const rootTransient2 = root.resolve<ImplService>(tokenTransient)
        expect(rootTransient1).not.toBe(rootTransient2)

        const child = root.createChildContainer()
        const childScoped = child.resolve<ImplService>(tokenScoped)
        expect(childScoped).not.toBe(rootScoped1)
    })

    it("throws for resolutionScoped factory providers", () => {
        const container = Container.createChildContainer()
        const token = Symbol.for("tests:factory-resolution-scoped")

        expect(() =>
            registerProvider(container, {
                provide: token,
                useFactory: () => new ImplService(),
                scope: "resolutionScoped",
            })
        ).toThrowError(/not supported/)
    })
})

describe("registerProviders", () => {
    it("registers provider arrays in order", () => {
        const container = Container.createChildContainer()

        registerProviders(container, [
            ServiceA,
            { provide: ServiceB, useClass: ServiceB },
        ])

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
