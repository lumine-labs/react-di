import { describe, expect, it, vi } from "vitest"
import { Container } from "../../src/aliases/index.js"
import { ModuleMetadata } from "../../src/core/providers/module-metadata/module-metadata.provider.js"
import { Resolver } from "../../src/core/providers/resolver/resolver.provider.js"
import { createModuleResolution } from "../../src/core/module/resolution.js"
import { ModuleLifecycle } from "../../src/core/providers/module-lifecycle/module-lifecycle.provider.js"
import type { ModuleResolution } from "../../src/core/module/resolution.types.js"
import type { ModuleHooks, ProviderLifecycle } from "../../src/core/providers/module-lifecycle/module-lifecycle.types.js"

class ParentService {
    readonly value = "parent"
}

class LocalService {
    readonly value = "local"
}

class LifecycleService implements ProviderLifecycle {
    constructor(private readonly onInit: () => void) {}

    onModuleInit(): void {
        this.onInit()
    }
}

/** Run the local lifecycle through the orchestrator, as useModule wires it for owned resolutions. */
function initModule(resolution: ModuleResolution, hooks?: ModuleHooks): void {
    resolution.container.resolve(ModuleLifecycle).init(hooks)
}

describe("createModuleResolution", () => {
    it("creates owned container in root mode", () => {
        const resolution = createModuleResolution(null, { root: true })

        expect(resolution.owned).toBe(true)
    })

    it("creates lifecycle plan and registers default providers for owned resolution", () => {
        const resolution = createModuleResolution(null, { root: true })
        initModule(resolution)

        expect(resolution.container.isRegistered(Resolver, false)).toBe(true)
        expect(resolution.container.isRegistered(ModuleMetadata, false)).toBe(true)
        expect(resolution.container.resolve(ModuleMetadata).id).toBeTypeOf("string")
    })

    it("uses explicit module id override in ModuleMetadata", () => {
        const resolution = createModuleResolution(null, { root: true, id: "feature:users" })
        initModule(resolution)

        expect(resolution.container.resolve(ModuleMetadata).id).toBe("feature:users")
    })

    it("generates unique auto ids for owned module resolutions", () => {
        const first = createModuleResolution(null, { root: true })
        const second = createModuleResolution(null, { root: true })

        initModule(first)
        initModule(second)

        const firstId = first.container.resolve(ModuleMetadata).id
        const secondId = second.container.resolve(ModuleMetadata).id
        const firstSeq = Number(firstId.split(":").at(-1))
        const secondSeq = Number(secondId.split(":").at(-1))

        expect(typeof firstId).toBe("string")
        expect(typeof secondId).toBe("string")
        expect(Number.isNaN(firstSeq)).toBe(false)
        expect(Number.isNaN(secondSeq)).toBe(false)
        expect(secondSeq).toBeGreaterThan(firstSeq)
    })

    it("returns provided container in inherit mode without owning it", () => {
        const parentResolution = createModuleResolution(null, { root: true, id: "parent-module" })
        initModule(parentResolution)

        const inherited = parentResolution.container
        const resolution = createModuleResolution(null, { container: inherited })

        expect(resolution.owned).toBe(false)
        expect(resolution.container).toBe(inherited)
        expect(resolution.container.resolve(ModuleMetadata).id).toBe("parent-module")
    })

    it("throws when inherit mode is used with id/providers or onModuleInit", () => {
        const inherited = Container.createChildContainer()

        expect(() =>
            createModuleResolution(null, {
                container: inherited,
                id: "x" as never,
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
        initModule(resolution, { onModuleInit })

        expect(resolution.container.resolve(LocalService)).toBeInstanceOf(LocalService)
        expect(onModuleInit).toHaveBeenCalledTimes(1)
        expect(onModuleInit).toHaveBeenCalledWith(resolution.container)
    })

    it("binds Resolver to the nearest owned module's container through inherit-mode modules", () => {
        const owned = createModuleResolution(null, { root: true })
        initModule(owned)

        // Inherit-mode module layered under the owned module: transparent, no own registrations.
        const unownedContainer = owned.container.createChildContainer()
        const inherited = createModuleResolution(null, { container: unownedContainer })
        expect(inherited.owned).toBe(false)

        // A component under the inherit-mode module gets the nearest owned ancestor's instance...
        const resolver = inherited.container.resolve(Resolver)
        expect(resolver).toBe(owned.container.resolve(Resolver))

        // ...bound to that ancestor's container, not the initiating one: non-recursive resolution
        // sees the owned module's registrations but not the inherit-layer's own.
        const OwnedToken = Symbol("OWNED_TOKEN")
        const InheritToken = Symbol("INHERIT_TOKEN")
        owned.container.register(OwnedToken, { useValue: "from-owned" })
        unownedContainer.register(InheritToken, { useValue: "from-inherit-layer" })

        expect(resolver.resolve(OwnedToken, false)).toBe("from-owned")
        expect(resolver.tryResolve(InheritToken, false)).toBeUndefined()
    })

    it("allows overriding default providers with explicit module providers", () => {
        const customResolver = { resolve: vi.fn(), tryResolve: vi.fn() } as any

        const resolution = createModuleResolution(null, {
            root: true,
            providers: [{ provide: Resolver, useValue: customResolver }],
        })
        initModule(resolution)

        // The Resolver system provider is registered first; an explicit override wins (last-registered).
        expect(resolution.container.resolve(Resolver)).toBe(customResolver)
    })

    it("throws when module init lifecycle callback fails", () => {
        const onModuleInit = () => {
            throw new Error("init failed")
        }
        const resolution = createModuleResolution(null, { root: true, onModuleInit })

        expect(() => initModule(resolution, { onModuleInit })).toThrowError("init failed")
    })

    it("runs init lifecycle for repeated provider tokens by registration occurrence", () => {
        const calls: string[] = []
        const TOKEN = Symbol("MULTI_TOKEN")
        const MIDDLE_TOKEN = Symbol("MIDDLE_TOKEN")

        const first: ProviderLifecycle = {
            onModuleInit: () => {
                calls.push("first")
            },
        }
        const middle: ProviderLifecycle = {
            onModuleInit: () => {
                calls.push("middle")
            },
        }
        const second: ProviderLifecycle = {
            onModuleInit: () => {
                calls.push("second")
            },
        }

        const resolution = createModuleResolution(null, {
            root: true,
            providers: [
                { provide: TOKEN, useValue: first },
                { provide: MIDDLE_TOKEN, useValue: middle },
                { provide: TOKEN, useValue: second },
            ],
        })

        initModule(resolution)

        expect(calls).toEqual(["first", "middle", "second"])
    })

    it("does not run lifecycle for useExisting alias provider", () => {
        const onInit = vi.fn()
        const Alias = Symbol("Alias")

        const parentResolution = createModuleResolution(null, {
            root: true,
            providers: [{ provide: LifecycleService, useValue: new LifecycleService(onInit) }],
        })
        initModule(parentResolution)

        const childResolution = createModuleResolution(parentResolution.container, {
            providers: [{ provide: Alias, useExisting: LifecycleService }],
        })
        initModule(childResolution)

        expect(onInit).toHaveBeenCalledTimes(1)
        expect(childResolution.container.resolve(Alias)).toBe(parentResolution.container.resolve(LifecycleService))
    })

    it("runs lifecycle for useValue providers with lifecycle methods", () => {
        const onInit = vi.fn()
        const ValueToken = Symbol("ValueToken")

        const instance = new LifecycleService(onInit)
        const resolution = createModuleResolution(null, {
            root: true,
            providers: [{ provide: ValueToken, useValue: instance }],
        })

        initModule(resolution)

        expect(onInit).toHaveBeenCalledTimes(1)
        expect(resolution.container.resolve(ValueToken)).toBe(instance)
    })
})
