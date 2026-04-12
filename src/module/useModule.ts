import { useContext, useEffect, useRef, useState } from "react"
import { type DependencyContainer } from "../aliases/index.js"

import {
    type ModuleHooks,
    type ModuleResolution,
    type ModuleResolutionLifecycle,
    type UseModuleParams,
    type UseModuleResult,
} from "./types.js"
import { createModuleResolution } from "./module.js"
import { ModuleContext } from "./useModuleContext.js"
import { AsyncTeardown } from "../module-cleanup/async-teardown.js"
import { useEvent } from "../internals/hooks/useEvent.js"
import { useScheduleLayoutEffect } from "../internals/hooks/useScheduleLayoutEffect.js"
import {
    createModuleResolutionLifecycle,
    runModuleDestroyLifecycle,
    runModuleInitLifecycle,
    runModuleMountLifecycle,
    runModuleUnmountLifecycle,
} from "./lifecycle.js"

type ModuleState = {
    id: number
    resolution: ModuleResolution
    lifecycle: ModuleResolutionLifecycle
}

// useModule
// ========================================
export function useModule(params?: UseModuleParams): UseModuleResult {
    // Parent
    const parentContext = useContext(ModuleContext)
    const parentContainer = parentContext?.container ?? null
    const prevParentContainerRef = useRef(parentContainer)

    // React bridge for module hooks (latest closures, stable identities)
    const hooks = useModuleLifecycleHooks(params)
    const lifecycleParams = attachReactiveModuleHooks(params, hooks)

    // Resolution State
    const [state, setState] = useState<ModuleState>(() => initializeModuleState(0, parentContainer, lifecycleParams))

    // Lifecycle
    const lastMountedIdRef = useRef<number | null>(null)
    const lastCleanupIdRef = useRef<number | null>(null)

    const mountById = useEvent((moduleState: ModuleState) => {
        if (lastMountedIdRef.current === moduleState.id) return
        lastMountedIdRef.current = moduleState.id
        mountModuleResolution(moduleState.resolution, moduleState.lifecycle)
    })

    const cleanupById = useEvent((moduleState: ModuleState) => {
        if (lastCleanupIdRef.current === moduleState.id) return
        lastCleanupIdRef.current = moduleState.id
        cleanupModuleResolution(moduleState.resolution, moduleState.lifecycle)
    })

    useEffect(() => {
        mountById(state)
        return () => cleanupById(state)
    }, [state, mountById, cleanupById])

    // Rebuilder. Uses scheduler to batch multiple rebuilds
    const schedule = useScheduleLayoutEffect()

    const performRebuild = useEvent(() => {
        setState((prev) => {
            cleanupById(prev)
            return initializeModuleState(prev.id + 1, parentContainer, lifecycleParams)
        })
    })

    const rebuild = useEvent(() => {
        schedule("module.rebuild", performRebuild)
    })

    // Rebuild when Parent is changed
    useEffect(() => {
        const isScopedMode = !params?.root && !params?.container && !params?.factory
        if (isScopedMode && prevParentContainerRef.current !== parentContainer) {
            rebuild()
        }

        prevParentContainerRef.current = parentContainer
    }, [parentContainer, rebuild])

    return {
        container: state.resolution.container,
        owned: state.resolution.owned,
        id: state.id,
        rebuild,
    }
}

function useModuleLifecycleHooks(params?: UseModuleParams): ModuleHooks {
    const onModuleInitEvent = useEvent((container: DependencyContainer) => {
        params?.onModuleInit?.(container)
    })
    const onModuleMountEvent = useEvent((container: DependencyContainer) => {
        params?.onModuleMount?.(container)
    })
    const onModuleUnmountEvent = useEvent((container: DependencyContainer) => {
        params?.onModuleUnmount?.(container)
    })
    const onModuleDestroyEvent = useEvent((container: DependencyContainer) => {
        params?.onModuleDestroy?.(container)
    })
    return {
        onModuleInit: onModuleInitEvent,
        onModuleMount: onModuleMountEvent,
        onModuleUnmount: onModuleUnmountEvent,
        onModuleDestroy: onModuleDestroyEvent,
    }
}

// State processors
// ========================================
function initializeModuleState(
    id: number,
    parentContainer: DependencyContainer | null,
    params?: UseModuleParams
): ModuleState {
    const resolution = createModuleResolution(parentContainer, params)
    const emptyLifecycle: ModuleResolutionLifecycle = {
        moduleHooks: {},
        lifecycleTokens: [],
        lifecycleInstances: [],
    }
    if (!resolution.owned) {
        return { id, resolution, lifecycle: emptyLifecycle }
    }

    let lifecycle: ModuleResolutionLifecycle = emptyLifecycle

    try {
        lifecycle = createModuleResolutionLifecycle(resolution, params)
        runModuleInitLifecycle(resolution, lifecycle)
    } catch (error) {
        try {
            if (resolution.owned) {
                const result = resolution.container.dispose()
                if (result instanceof Promise) {
                    void result
                }
            }
        } catch {
            // noop
        }
        throw error
    }

    return { id, resolution, lifecycle }
}

function attachReactiveModuleHooks(
    params: UseModuleParams | undefined,
    hooks: ModuleHooks
): UseModuleParams | undefined {
    if (!params) return params

    const next = { ...params } as UseModuleParams
    if (params.onModuleInit) (next as any).onModuleInit = hooks.onModuleInit
    if (params.onModuleMount) (next as any).onModuleMount = hooks.onModuleMount
    if (params.onModuleUnmount) (next as any).onModuleUnmount = hooks.onModuleUnmount
    if (params.onModuleDestroy) (next as any).onModuleDestroy = hooks.onModuleDestroy
    return next
}

// Lifecycle processors
// ========================================
export function cleanupModuleResolution(resolution: ModuleResolution, lifecycle: ModuleResolutionLifecycle): void {
    runModuleUnmountLifecycle(resolution, lifecycle)

    if (resolution.owned) {
        scheduleContainerDestroy(resolution, lifecycle)
    }
}

function mountModuleResolution(resolution: ModuleResolution, lifecycle: ModuleResolutionLifecycle): void {
    runModuleMountLifecycle(resolution, lifecycle)
}

function scheduleContainerDestroy(resolution: ModuleResolution, lifecycle: ModuleResolutionLifecycle): void {
    setTimeout(() => {
        void runScheduledCleanup(resolution, lifecycle)
    }, 0)
}

async function runScheduledCleanup(resolution: ModuleResolution, lifecycle: ModuleResolutionLifecycle): Promise<void> {
    const { container } = resolution

    try {
        if (container.isRegistered(AsyncTeardown, false)) {
            await container.resolve(AsyncTeardown).run()
        }
    } catch (error) {
        console.error("module.asyncTeardown", error)
    }

    runModuleDestroyLifecycle(resolution, lifecycle)

    try {
        const result = container.dispose()
        if (result instanceof Promise) {
            await result
        }
    } catch (error) {
        console.error("module.dispose", error)
    }
}
