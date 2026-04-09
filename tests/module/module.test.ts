import { describe, expect, it, vi } from "vitest"
import { Container } from "../../src/aliases/index.js"
import { CleanupRegistry } from "../../src/module-cleanup/cleanup-registry.js"
import { Resolver } from "../../src/resolver/resolver.js"
import { createModuleResolution } from "../../src/module/module.js"

class ParentService {
    readonly value = "parent"
}

class LocalService {
    readonly value = "local"
}

describe("createModuleResolution", () => {
    it("creates owned container in root mode and registers default providers", () => {
        const resolution = createModuleResolution(null, { root: true })

        expect(resolution.owned).toBe(true)
        expect(resolution.container.isRegistered(Resolver, false)).toBe(true)
        expect(resolution.container.isRegistered(CleanupRegistry, false)).toBe(true)
    })

    it("returns provided container in inherit mode without owning it", () => {
        const inherited = Container.createChildContainer()
        const resolution = createModuleResolution(null, { container: inherited })

        expect(resolution.owned).toBe(false)
        expect(resolution.container).toBe(inherited)
    })

    it("throws when inherit mode is used with providers or onModuleInit", () => {
        const inherited = Container.createChildContainer()

        expect(() =>
            createModuleResolution(null, {
                container: inherited,
                providers: [] as never,
            } as never)
        ).toThrowError(/not allowed/)
    })

    it("throws when root mode is mixed with container/factory", () => {
        const inherited = Container.createChildContainer()

        expect(() => createModuleResolution(null, { root: true, container: inherited } as never)).toThrowError(
            /cannot be used/
        )
    })

    it("throws when no parent and no creation params are provided", () => {
        expect(() => createModuleResolution(null, undefined)).toThrowError(/No parent container/)
    })

    it("creates owned container in factory mode", () => {
        const factoryContainer = Container.createChildContainer()

        const resolution = createModuleResolution(null, {
            factory: () => factoryContainer,
        })

        expect(resolution.owned).toBe(true)
        expect(resolution.container).toBe(factoryContainer)
    })

    it("throws when factory returns falsy value", () => {
        expect(() =>
            createModuleResolution(null, {
                factory: () => null as any,
            })
        ).toThrowError(/returned falsy/)
    })

    it("creates owned scoped child container from parent context", () => {
        const parent = Container.createChildContainer()
        parent.registerSingleton(ParentService)

        const resolution = createModuleResolution(parent, {})

        expect(resolution.owned).toBe(true)
        expect(resolution.container).not.toBe(parent)
        expect(resolution.container.resolve(ParentService)).toBeInstanceOf(ParentService)
    })

    it("registers module providers and calls onModuleInit", () => {
        const onModuleInit = vi.fn()

        const resolution = createModuleResolution(null, {
            root: true,
            providers: [LocalService],
            onModuleInit,
        })

        expect(resolution.container.resolve(LocalService)).toBeInstanceOf(LocalService)
        expect(onModuleInit).toHaveBeenCalledTimes(1)
        expect(onModuleInit).toHaveBeenCalledWith(resolution.container)
    })

    it("allows overriding default providers with explicit module providers", () => {
        const customResolver = { resolve: vi.fn(), tryResolve: vi.fn() } as any

        const resolution = createModuleResolution(null, {
            root: true,
            providers: [{ provide: Resolver, useValue: customResolver }],
        })

        expect(resolution.container.resolve(Resolver)).toBe(customResolver)
    })

    it("disposes owned container if onModuleInit throws", () => {
        const owned = Container.createChildContainer()
        const disposeSpy = vi.spyOn(owned, "dispose")

        expect(() =>
            createModuleResolution(null, {
                factory: () => owned,
                onModuleInit: () => {
                    throw new Error("init failed")
                },
            })
        ).toThrowError("init failed")

        expect(disposeSpy).toHaveBeenCalledTimes(1)
    })
})
