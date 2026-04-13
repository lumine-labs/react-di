import { describe, expect, it, vi } from "vitest"
import { Container } from "../../src/aliases/index.js"
import {
    ContainerResolver,
    UNSAFE_CONTAINER_RESOLVER,
} from "../../src/core/providers/container-resolver/container-resolver.js"
import { Resolver } from "../../src/core/providers/resolver/resolver.js"
import { createModuleResolution } from "../../src/core/module/resolution.js"
import { createModuleResolutionLifecycle } from "../../src/core/module/lifecycle.js"
import { runModuleInitLifecycle } from "../../src/core/module/lifecycle.runners.js"
import type { ModuleLifecycle } from "../../src/core/module/lifecycle.types.js"

class ParentService {
    readonly value = "parent"
}

class LocalService {
    readonly value = "local"
}

class LifecycleService implements ModuleLifecycle {
    constructor(private readonly onInit: () => void) {}

    onModuleInit(): void {
        this.onInit()
    }
}

describe("createModuleResolution", () => {
    it("creates owned container in root mode", () => {
        const resolution = createModuleResolution(null, { root: true })

        expect(resolution.owned).toBe(true)
    })

    it("creates lifecycle plan and registers default providers for owned resolution", () => {
        const resolution = createModuleResolution(null, { root: true })
        const lifecycle = createModuleResolutionLifecycle(resolution, { root: true })

        runModuleInitLifecycle(resolution, lifecycle)

        expect(resolution.container.isRegistered(Resolver, false)).toBe(true)
        expect(resolution.container.isRegistered(UNSAFE_CONTAINER_RESOLVER, false)).toBe(true)
        expect(resolution.container.resolve(UNSAFE_CONTAINER_RESOLVER)).toBeInstanceOf(ContainerResolver)
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
        const lifecycle = createModuleResolutionLifecycle(resolution, {
            root: true,
            providers: [LocalService],
            onModuleInit,
        })
        runModuleInitLifecycle(resolution, lifecycle)

        expect(resolution.container.resolve(LocalService)).toBeInstanceOf(LocalService)
        expect(onModuleInit).toHaveBeenCalledTimes(1)
        expect(onModuleInit).toHaveBeenCalledWith(resolution.container)
    })

    it("allows overriding default providers with explicit module providers", () => {
        const customResolver = { resolve: vi.fn(), tryResolve: vi.fn() } as any
        const customContainerResolver = { unsafe_getContainer: vi.fn() } as any

        const resolution = createModuleResolution(null, {
            root: true,
            providers: [
                { provide: Resolver, useValue: customResolver },
                { provide: UNSAFE_CONTAINER_RESOLVER, useValue: customContainerResolver },
            ],
        })
        const lifecycle = createModuleResolutionLifecycle(resolution, {
            root: true,
            providers: [
                { provide: Resolver, useValue: customResolver },
                { provide: UNSAFE_CONTAINER_RESOLVER, useValue: customContainerResolver },
            ],
        })
        runModuleInitLifecycle(resolution, lifecycle)

        expect(resolution.container.resolve(Resolver)).toBe(customResolver)
        expect(resolution.container.resolve(UNSAFE_CONTAINER_RESOLVER)).toBe(customContainerResolver)
    })

    it("throws when module init lifecycle callback fails", () => {
        const resolution = createModuleResolution(null, {
            root: true,
            onModuleInit: () => {
                throw new Error("init failed")
            },
        })
        const lifecycle = createModuleResolutionLifecycle(resolution, {
            root: true,
            onModuleInit: () => {
                throw new Error("init failed")
            },
        })

        expect(() => runModuleInitLifecycle(resolution, lifecycle)).toThrowError("init failed")
    })

    it("runs init lifecycle for repeated provider tokens by registration occurrence", () => {
        const calls: string[] = []
        const TOKEN = Symbol("MULTI_TOKEN")
        const MIDDLE_TOKEN = Symbol("MIDDLE_TOKEN")

        const first: ModuleLifecycle = {
            onModuleInit: () => {
                calls.push("first")
            },
        }
        const middle: ModuleLifecycle = {
            onModuleInit: () => {
                calls.push("middle")
            },
        }
        const second: ModuleLifecycle = {
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
        const lifecycle = createModuleResolutionLifecycle(resolution, {
            root: true,
            providers: [
                { provide: TOKEN, useValue: first },
                { provide: MIDDLE_TOKEN, useValue: middle },
                { provide: TOKEN, useValue: second },
            ],
        })

        runModuleInitLifecycle(resolution, lifecycle)

        expect(calls).toEqual(["first", "middle", "second"])
    })

    it("does not run lifecycle for useExisting alias provider", () => {
        const onInit = vi.fn()
        const Alias = Symbol("Alias")

        const parentResolution = createModuleResolution(null, {
            root: true,
            providers: [{ provide: LifecycleService, useValue: new LifecycleService(onInit) }],
        })
        const parentLifecycle = createModuleResolutionLifecycle(parentResolution, {
            root: true,
            providers: [{ provide: LifecycleService, useValue: new LifecycleService(onInit) }],
        })
        runModuleInitLifecycle(parentResolution, parentLifecycle)

        const childResolution = createModuleResolution(parentResolution.container, {
            providers: [{ provide: Alias, useExisting: LifecycleService }],
        })
        const childLifecycle = createModuleResolutionLifecycle(childResolution, {
            providers: [{ provide: Alias, useExisting: LifecycleService }],
        })
        runModuleInitLifecycle(childResolution, childLifecycle)

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
        const lifecycle = createModuleResolutionLifecycle(resolution, {
            root: true,
            providers: [{ provide: ValueToken, useValue: instance }],
        })

        runModuleInitLifecycle(resolution, lifecycle)

        expect(onInit).toHaveBeenCalledTimes(1)
        expect(resolution.container.resolve(ValueToken)).toBe(instance)
    })
})
