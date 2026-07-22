import type { DependencyContainer } from "../../../aliases/index.js"

// Lifecycle hooks for providers
// ========================================

export type ProviderLifecycle = {
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
