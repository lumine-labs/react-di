import type { Container } from "../../../container/index.js"

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

export type ModulePhase = "init" | "mount" | "unmount" | "destroy"

export type ModuleHook = (container: Container) => unknown
export type ModuleErrorHook = (phase: ModulePhase, error: unknown) => unknown

export type ModuleHooks = {
    onModuleInit?: ModuleHook
    onModuleMount?: ModuleHook
    onModuleUnmount?: ModuleHook
    onModuleDestroy?: ModuleHook
    onModuleError?: ModuleErrorHook
}
