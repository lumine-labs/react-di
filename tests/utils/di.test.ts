import { describe, expect, it, vi } from "vitest"
import { Container } from "../../src/aliases/index.js"
import { resolveOr, tryResolve } from "../../src/shared/container-utils.js"

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
