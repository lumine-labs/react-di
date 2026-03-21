import { describe, expect, it, vi } from "vitest"
import { Container } from "../../src/aliases/index.js"
import { resolveOr, tryResolve } from "../../src/utils/di.js"

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
})
