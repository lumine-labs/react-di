import type { DependencyContainer } from "../../aliases/index.js"

import type { ModuleHooks } from "../providers/module-lifecycle/module-lifecycle.types.js"
import type { Provider } from "../providers/providers.types.js"

// Module parameters
// ========================================

type BaseModuleParams = {
    id?: string
    providers?: Provider[]
    rebuildOn?: unknown[]
} & ModuleHooks

export type RootModuleParams = {
    root: true
    factory?: never
    container?: never
} & BaseModuleParams

export type FactoryModuleParams = {
    factory: () => DependencyContainer
    root?: never
    container?: never
} & BaseModuleParams

export type ScopedModuleParams = {
    root?: never
    factory?: never
    container?: never
} & BaseModuleParams

export type ModuleResolutionParams = RootModuleParams | FactoryModuleParams | ScopedModuleParams

export type ModuleResolution = {
    container: DependencyContainer
    id: string
}
