import { afterEach, describe, expect, it, vi } from "vitest"
import { Container } from "../../src/aliases/index.js"
import { resolve, resolveOr, tryResolve } from "../../src/core/resolve.js"
import { createModuleResolution } from "../../src/core/module/resolution.js"

class ServiceA {}

describe("di utils", () => {
    it("tryResolve resolves recursively by default", () => {
        const parent = Container.createChildContainer()
        const child = parent.createChildContainer()
        parent.registerSingleton(ServiceA)

        const resolved = tryResolve(child, ServiceA)
        expect(resolved).toBeInstanceOf(ServiceA)
    })

    it("tryResolve returns undefined when token is missing in current scope and recursive=false", () => {
        const parent = Container.createChildContainer()
        const child = parent.createChildContainer()
        parent.registerSingleton(ServiceA)

        const resolved = tryResolve(child, ServiceA, false)
        expect(resolved).toBeUndefined()
    })

    it("resolveOr returns fallback value when token is missing", () => {
        const container = Container.createChildContainer()
        const fallback = { ok: true }

        const resolved = resolveOr(container, ServiceA, fallback)
        expect(resolved).toBe(fallback)
    })

    it("resolveOr executes fallback callback lazily only when needed", () => {
        const container = Container.createChildContainer()
        container.registerSingleton(ServiceA)

        const fallback = vi.fn(() => new ServiceA())
        const resolved = resolveOr(container, ServiceA, fallback)

        expect(resolved).toBeInstanceOf(ServiceA)
        expect(fallback).not.toHaveBeenCalled()
    })

    it("returns a registered undefined from a factory instead of the fallback", () => {
        const container = Container.createChildContainer()
        const token = Symbol.for("tests:resolveOr:registered-undefined")
        // tsyringe cannot register `useValue: undefined` (its value-provider guard rejects undefined),
        // so a factory that returns undefined models a legitimately-registered undefined value.
        container.register(token, { useFactory: () => undefined })

        const resolved = resolveOr(container, token, "fallback")
        expect(resolved).toBeUndefined()
    })

    it("resolveOr returns a registered falsy value instead of the fallback", () => {
        const container = Container.createChildContainer()
        const token = Symbol.for("tests:resolveOr:registered-zero")
        container.register(token, { useValue: 0 })

        const resolved = resolveOr(container, token, 42)
        expect(resolved).toBe(0)
    })

    it("resolveOr invokes the function fallback lazily only when the token is unregistered", () => {
        const container = Container.createChildContainer()
        const fallback = vi.fn(() => "fallback")

        const resolved = resolveOr(container, ServiceA, fallback)
        expect(resolved).toBe("fallback")
        expect(fallback).toHaveBeenCalledTimes(1)
    })
})

describe("resolve failure messages", () => {
    afterEach(() => {
        vi.unstubAllEnvs()
    })

    const API_URL = Symbol("API_URL")

    it("names the token and the module it searched", () => {
        const { container } = createModuleResolution(null, { root: true, id: "feature:checkout" })

        expect(() => resolve(container, API_URL)).toThrowError(
            'Token Symbol(API_URL) is not registered in module "feature:checkout" or any ancestor.'
        )
    })

    it("says the search stopped at the module when recursive=false", () => {
        const parent = createModuleResolution(null, { root: true, id: "feature:app", providers: [ServiceA] })
        const child = createModuleResolution(parent.container, { id: "feature:checkout" })

        // The token IS reachable from the child — just not without walking up, which is the whole point
        // of the message.
        expect(resolve(child.container, ServiceA)).toBeInstanceOf(ServiceA)
        expect(() => resolve(child.container, ServiceA, false)).toThrowError(
            'Token ServiceA is not registered in module "feature:checkout" (searched that module only).'
        )
    })

    it("names the generated id, label and all, when the module has no user id", () => {
        const { container } = createModuleResolution(null, { root: true, providers: [ServiceA] })

        expect(() => resolve(container, "API_URL")).toThrowError(
            /^Token API_URL is not registered in module "id:\d+" or any ancestor\.$/
        )
    })

    it("falls back to the container when there is no module to name", () => {
        const bare = Container.createChildContainer()

        expect(() => resolve(bare, API_URL)).toThrowError(
            "Token Symbol(API_URL) is not registered in this container or any ancestor."
        )
        expect(() => resolve(bare, API_URL, false)).toThrowError(
            "Token Symbol(API_URL) is not registered in this container (searched that container only)."
        )
    })

    it("keeps production messages short: token description only", () => {
        const { container } = createModuleResolution(null, { root: true, id: "feature:checkout" })
        vi.stubEnv("NODE_ENV", "production")

        expect(() => resolve(container, API_URL)).toThrowError("Token Symbol(API_URL) is not registered.")
        expect(() => resolve(container, API_URL, false)).toThrowError("Token Symbol(API_URL) is not registered.")
        expect(() => resolve(container, API_URL)).not.toThrowError(/module|ancestor|searched/)
    })
})
