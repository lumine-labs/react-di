import { describe, expect, it } from "vitest"
import { Container } from "../../src/aliases/index.js"
import { Resolver } from "../../src/resolver/resolver.js"

class ParentService {}

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

        expect(() => resolver.resolve(missing)).toThrowError()
    })
})
