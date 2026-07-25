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

/** Run the local lifecycle through the orchestrator, exactly as useModule wires it. */
function initModule(resolution: ModuleResolution, hooks?: ModuleHooks): void {
    resolution.container.resolve(ModuleLifecycle).init(hooks)
}

describe("createModuleResolution", () => {
    it("creates a fresh container in root mode", () => {
        const resolution = createModuleResolution(null, { root: true })

        expect(resolution.container).toBeTruthy()
        expect(resolution.container.isRegistered(ModuleMetadata, false)).toBe(true)
    })

    it("creates lifecycle plan and registers default providers", () => {
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

    it("generates unique auto ids for module resolutions", () => {
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

    it("throws when root mode is mixed with factory", () => {
        expect(() =>
            createModuleResolution(null, { root: true, factory: () => Container.createChildContainer() } as never)
        ).toThrowError(/cannot be used/)
    })

    it("throws when no parent and no creation params are provided", () => {
        expect(() => createModuleResolution(null, undefined)).toThrowError(/No parent container/)
    })

    it("adopts the factory's container in factory mode", () => {
        const factoryContainer = Container.createChildContainer()

        const resolution = createModuleResolution(null, {
            factory: () => factoryContainer,
        })

        expect(resolution.container).toBe(factoryContainer)
        expect(factoryContainer.resolve(ModuleMetadata).id).toBe(resolution.id)
    })

    it("throws when factory returns falsy value", () => {
        expect(() =>
            createModuleResolution(null, {
                factory: () => null as any,
            })
        ).toThrowError(/returned falsy/)
    })

    it("throws when factory returns a container that is already a module", () => {
        const existing = createModuleResolution(null, { root: true, id: "feature:taken" })
        initModule(existing)

        expect(() => createModuleResolution(null, { factory: () => existing.container })).toThrowError(
            'Container already belongs to module "feature:taken". One container = one module — give `factory` a fresh container, or drop `factory` to create a scoped child.'
        )
    })

    it("leaves the already-claimed container intact when the 1:1 guard trips", () => {
        const existing = createModuleResolution(null, { root: true, id: "feature:taken" })
        initModule(existing)

        expect(() =>
            createModuleResolution(null, { factory: () => existing.container, providers: [LocalService] })
        ).toThrowError(/One container = one module/)

        // The guard runs before any registration, so nothing of the rejected module leaked in.
        expect(existing.container.resolve(ModuleMetadata).id).toBe("feature:taken")
        expect(existing.container.isRegistered(LocalService, false)).toBe(false)
    })

    it("throws when the same factory container is adopted twice", () => {
        const shared = Container.createChildContainer()
        const factory = () => shared

        const first = createModuleResolution(null, { factory, id: "first" })
        initModule(first)

        expect(() => createModuleResolution(null, { factory, id: "second" })).toThrowError(
            'Container already belongs to module "first". One container = one module — give `factory` a fresh container, or drop `factory` to create a scoped child.'
        )
    })

    it("creates a scoped child container from parent context", () => {
        const parent = Container.createChildContainer()
        parent.registerSingleton(ParentService)

        const resolution = createModuleResolution(parent, {})

        expect(resolution.container).not.toBe(parent)
        expect(resolution.container.resolve(ParentService)).toBeInstanceOf(ParentService)
    })

    it("creates a scoped child under a module container without claiming the parent's metadata", () => {
        // The 1:1 guard is non-recursive precisely so this stays legal: the child resolves the parent's
        // ModuleMetadata through the chain, which is not a claim on the parent's container.
        const parentResolution = createModuleResolution(null, { root: true, id: "parent-module" })
        initModule(parentResolution)

        const child = createModuleResolution(parentResolution.container, { id: "child-module" })

        expect(child.container).not.toBe(parentResolution.container)
        expect(child.container.resolve(ModuleMetadata).id).toBe("child-module")
        expect(parentResolution.container.resolve(ModuleMetadata).id).toBe("parent-module")
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

    it("binds Resolver to the module's own container", () => {
        const parentResolution = createModuleResolution(null, { root: true })
        initModule(parentResolution)

        const child = createModuleResolution(parentResolution.container, {})
        initModule(child)

        // Each module gets its own Resolver, never the parent's.
        const resolver = child.container.resolve(Resolver)
        expect(resolver).not.toBe(parentResolution.container.resolve(Resolver))

        // Bound to the module's own container: non-recursive resolution sees the module's own
        // registrations and stops there.
        const ParentToken = Symbol("PARENT_TOKEN")
        const ChildToken = Symbol("CHILD_TOKEN")
        parentResolution.container.register(ParentToken, { useValue: "from-parent" })
        child.container.register(ChildToken, { useValue: "from-child" })

        expect(resolver.resolve(ChildToken, false)).toBe("from-child")
        expect(resolver.tryResolve(ParentToken, false)).toBeUndefined()
        expect(resolver.resolve(ParentToken)).toBe("from-parent")
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
