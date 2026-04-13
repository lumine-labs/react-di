import type { ModuleResolution } from "./resolution.types.js"
import type { ModuleResolutionLifecycle } from "./lifecycle.types.js"

type ModuleLifecycleMethod = "onModuleMount" | "onModuleUnmount" | "onModuleDestroy"

// Runners
// ========================================

export function runModuleInitLifecycle(resolution: ModuleResolution, lifecycle: ModuleResolutionLifecycle): void {
    try {
        lifecycle.moduleHooks?.onModuleInit?.(resolution.container)
    } catch (error) {
        console.error("module.onModuleInit", error)
        throw error
    }

    const instances = lifecycle.lifecycleInstances ?? []
    for (const instance of instances) {
        try {
            instance.onModuleInit?.()
        } catch (error) {
            console.error("provider.onModuleInit", error)
            throw error
        }
    }
}

export function runModuleMountLifecycle(resolution: ModuleResolution, lifecycle: ModuleResolutionLifecycle): void {
    runModuleHook(resolution, lifecycle, "onModuleMount")
    runProviderLifecycles(lifecycle.lifecycleInstances, "onModuleMount")
}

export function runModuleUnmountLifecycle(resolution: ModuleResolution, lifecycle: ModuleResolutionLifecycle): void {
    runProviderLifecycles(lifecycle.lifecycleInstances, "onModuleUnmount", true)
    runModuleHook(resolution, lifecycle, "onModuleUnmount")
}

export function runModuleDestroyLifecycle(resolution: ModuleResolution, lifecycle: ModuleResolutionLifecycle): void {
    runProviderLifecycles(lifecycle.lifecycleInstances, "onModuleDestroy", true)
    runModuleHook(resolution, lifecycle, "onModuleDestroy")
}

// Helpers
// ========================================

function runModuleHook(
    resolution: ModuleResolution,
    lifecycle: ModuleResolutionLifecycle,
    method: ModuleLifecycleMethod
): void {
    try {
        lifecycle.moduleHooks?.[method]?.(resolution.container)
    } catch (error) {
        console.error(`module.${method}`, error)
    }
}

function runProviderLifecycles(
    instances: ModuleResolutionLifecycle["lifecycleInstances"],
    method: ModuleLifecycleMethod,
    reverse = false
): void {
    if (!instances?.length) return

    const ordered = reverse ? [...instances].reverse() : instances
    for (const instance of ordered) {
        try {
            instance[method]?.()
        } catch (error) {
            console.error(`provider.${method}`, error)
        }
    }
}
