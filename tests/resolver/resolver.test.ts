import { describe, expect, it } from "vitest"
import { Container } from "../../src/aliases/index.js"
import { ContainerResolver } from "../../src/core/providers/container-resolver/container-resolver.js"
import { Resolver } from "../../src/core/providers/resolver/resolver"

class ParentService {}
class LocalService {}

describe("Resolver", () => {
    it("ContainerResolver exposes underlying container via unsafe API", () => {
        const container = Container.createChildContainer()
        const resolver = new ContainerResolver(container)

        expect(resolver.unsafe_getContainer()).toBe(container)
    })

    it("tryResolve resolves dependencies through parent containers", () => {
        const parent = Container.createChildContainer()
        const child = parent.createChildContainer()
        parent.registerSingleton(ParentService)

        const resolver = new Resolver(child)
        const resolved = resolver.tryResolve(ParentService)

        expect(resolved).toBeInstanceOf(ParentService)
    })

    it("resolve throws when token is not registered", () => {
        const child = Container.createChildContainer()
        const resolver = new Resolver(child)
        const missing = Symbol("Missing")

        expect(() => resolver.resolve(missing)).toThrowError()
    })

    it("resolve supports recursive=false", () => {
        const parent = Container.createChildContainer()
        const child = parent.createChildContainer()
        parent.registerSingleton(ParentService)
        child.registerSingleton(LocalService)
        const resolver = new Resolver(child)

        expect(resolver.resolve(LocalService, false)).toBeInstanceOf(LocalService)
        expect(() => resolver.resolve(ParentService, false)).toThrowError(/current module container/)
    })

    it("tryResolve supports recursive=false", () => {
        const parent = Container.createChildContainer()
        const child = parent.createChildContainer()
        parent.registerSingleton(ParentService)
        const resolver = new Resolver(child)

        expect(resolver.tryResolve(ParentService, false)).toBeUndefined()
        expect(resolver.tryResolve(ParentService, true)).toBeInstanceOf(ParentService)
    })
})
