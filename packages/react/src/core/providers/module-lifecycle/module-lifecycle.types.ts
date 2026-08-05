import type { Container } from "@remodulo/container"

// Lifecycle hooks for providers
// ========================================

export type ProviderLifecycle = {
    onModuleInit?(): unknown
    onModuleMount?(): unknown
    onModuleUnmount?(): unknown
    onModuleDestroy?(): unknown
}

// Lifecycle hooks for module
// ========================================

export type ModuleHook = (container: Container) => unknown

export type ModuleHooks = {
    onModuleInit?: ModuleHook
    onModuleMount?: ModuleHook
    onModuleUnmount?: ModuleHook
    onModuleDestroy?: ModuleHook
}
