import { describe, expect, it, vi } from "vitest"
import { Container } from "../../src/aliases/index.js"
import { CleanupRegistry } from "../../src/module-cleanup/cleanup-registry.js"
import { Resolver } from "../../src/resolver/resolver.js"
import { createModuleResolution } from "../../src/module/module.js"

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
