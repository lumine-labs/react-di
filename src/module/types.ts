import type { DependencyContainer, InjectionToken } from "../aliases/index.js"
import type { Provider } from "../providers/types.js"

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

// Module parameters
// ========================================

type OwnedModuleParams = {
    providers?: Provider[]

    onModuleInit?: ModuleHook
    onModuleMount?: ModuleHook
    onModuleUnmount?: ModuleHook
    onModuleDestroy?: ModuleHook
}

export type RootModuleParams = {
    root: true
    container?: never
    factory?: never
} & OwnedModuleParams

export type FactoryModuleParams = {
    factory: () => DependencyContainer
    root?: never
    container?: never
} & OwnedModuleParams

export type ScopedModuleParams = {
    root?: never
    container?: never
    factory?: never
} & OwnedModuleParams

export type InheritModuleParams = {
    container: DependencyContainer
    root?: never
    factory?: never

    providers?: never

    onModuleInit?: never
    onModuleMount?: never
    onModuleUnmount?: never
    onModuleDestroy?: never
}

export type UseModuleParams = RootModuleParams | FactoryModuleParams | ScopedModuleParams | InheritModuleParams

export type ModuleResolution = {
    container: DependencyContainer
    owned: boolean
    registeredTokens: InjectionToken<any>[]
}

export type ModuleResolutionLifecycle = {
    moduleHooks?: ModuleHooks
    lifecycleTokens?: InjectionToken<any>[]
    lifecycleInstances?: ModuleLifecycle[]
}

export type UseModuleResult = {
    container: DependencyContainer
    owned: boolean
    id: number
    rebuild: () => void
}
