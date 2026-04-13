import type { DependencyContainer, InjectionToken } from "../../aliases/index.js"

// Lifecycle hooks for providers
// ========================================

export interface ModuleLifecycle {
    onModuleInit?(): void
    onModuleMount?(): void
    onModuleUnmount?(): void
    onModuleDestroy?(): void
}

// Lifecycle hooks for module
// ========================================

export type ModuleHook = (container: DependencyContainer) => void
export type ModuleHooks = {
    onModuleInit?: ModuleHook
    onModuleMount?: ModuleHook
    onModuleUnmount?: ModuleHook
    onModuleDestroy?: ModuleHook
}

export type ModuleResolutionLifecycle = {
    moduleHooks?: ModuleHooks
    lifecycleTokens?: InjectionToken<any>[]
    lifecycleInstances?: ModuleLifecycle[]
}
