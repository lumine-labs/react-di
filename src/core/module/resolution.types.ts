import type { DependencyContainer } from "../../aliases/index.js"

import type { ModuleHooks } from "./lifecycle.types.js"
import type { Provider } from "../providers/providers.types.js"

// Module parameters
// ========================================

type OwnedModuleParams = {
    providers?: Provider[]
} & ModuleHooks

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

export type ModuleResolutionParams = RootModuleParams | FactoryModuleParams | ScopedModuleParams | InheritModuleParams

export type ModuleResolution = {
    container: DependencyContainer
    owned: boolean
    providers: Provider[]
}
