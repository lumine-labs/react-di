import { useContext, useEffect, useState } from "react"
import { type DependencyContainer } from "../aliases/index.js"

import { type ModuleResolution, type UseModuleParams } from "./types.js"
import { createModuleResolution } from "./module.js"
import { ContainerContext } from "../container/useContainer.js"
import { CleanupRegistry } from "../module-cleanup/cleanup-registry.js"

export function useModuleResolution(params?: UseModuleParams): ModuleResolution {
    const parent = useContext(ContainerContext)

    const [resolution] = useState(() => {
        return createModuleResolution(parent, params)
    })

    return resolution
}

export function useModule(params?: UseModuleParams): DependencyContainer {
    const resolution = useModuleResolution(params)

    useEffect(() => {
        return () => cleanupModuleResolution(resolution)
    }, [])

    return resolution.container
}

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
