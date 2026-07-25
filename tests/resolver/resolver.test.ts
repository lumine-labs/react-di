import { describe, expect, it } from "vitest"
import { Container } from "../../src/aliases/index.js"
import { Resolver } from "../../src/core/providers/resolver/resolver.provider"

class ParentService {}
class LocalService {}

describe("Resolver", () => {
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

        // A raw container carries no ModuleMetadata, so the message names the token and the search
        // scope but has no module to name.
        expect(() => resolver.resolve(missing)).toThrowError(
            "Token Symbol(Missing) is not registered in this container or any ancestor."
        )
    })

    it("resolve supports recursive=false", () => {
        const parent = Container.createChildContainer()
        const child = parent.createChildContainer()
        parent.registerSingleton(ParentService)
        child.registerSingleton(LocalService)
        const resolver = new Resolver(child)

        expect(resolver.resolve(LocalService, false)).toBeInstanceOf(LocalService)
        expect(() => resolver.resolve(ParentService, false)).toThrowError(
            "Token ParentService is not registered in this container (searched that container only)."
        )
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
