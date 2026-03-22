import { useContext, useEffect, useRef, useState } from "react"
import { type DependencyContainer } from "../aliases/index.js"

import { type ModuleResolution, type UseModuleParams, type UseModuleResult } from "./types.js"
import { createModuleResolution } from "./module.js"
import { ModuleContext } from "./useModuleContext.js"
import { CleanupRegistry } from "../module-cleanup/cleanup-registry.js"
import { useEvent } from "../internals/hooks/useEvent.js"
import { useScheduleLayoutEffect } from "../internals/hooks/useScheduleLayoutEffect.js"

// useModule
// ========================================
export function useModule(params?: UseModuleParams): UseModuleResult {
    // Module context
    const parentContext = useContext(ModuleContext)
    const parentContainer = parentContext?.container ?? null

    // Refs
    const lastCleanupIdRef = useRef<number | null>(null)
    const prevParentContainerRef = useRef(parentContainer)

    // Resolution State
    const [state, setState] = useState(() => ({
        id: 0,
        resolution: createModuleResolution(parentContainer, params),
    }))

    // Scheduler
    const schedule = useScheduleLayoutEffect()

    // Events
    const cleanupById = useEvent((id: number, resolution: ModuleResolution) => {
        if (lastCleanupIdRef.current === id) return
        lastCleanupIdRef.current = id
        cleanupModuleResolution(resolution)
    })

    const cleanupCurrentResolution = useEvent(() => {
        cleanupById(state.id, state.resolution)
    })

    const performRebuild = useEvent(() => {
        setState((prev) => {
            cleanupById(prev.id, prev.resolution)

            return {
                id: prev.id + 1,
                resolution: createModuleResolution(parentContainer, params),
            }
        })
    })

    const rebuild = useEvent(() => {
        schedule("module.rebuild", performRebuild)
    })

    // Cleanup on unmount
    useEffect(() => {
        return () => cleanupCurrentResolution()
    }, [cleanupCurrentResolution])

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

// Helpers
// ========================================
export function cleanupModuleResolution(resolution: ModuleResolution): void {
    try {
        resolution.cleanup?.()
    } catch (error) {
        console.error("module.cleanup", error)
    }

    if (resolution.owned) {
        scheduleContainerDispose(resolution.container)
    }
}

function scheduleContainerDispose(container: DependencyContainer): void {
    setTimeout(() => {
        void runScheduledCleanup(container)
    }, 0)
}

async function runScheduledCleanup(container: DependencyContainer): Promise<void> {
    try {
        if (container.isRegistered(CleanupRegistry, false)) {
            await container.resolve(CleanupRegistry).run()
        }
    } catch (error) {
        console.error("module.cleanupRegistry", error)
    }

    try {
        const result = container.dispose()
        if (result instanceof Promise) {
            await result
        }
    } catch (error) {
        console.error("module.dispose", error)
    }
}
