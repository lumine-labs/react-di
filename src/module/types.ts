import type { DependencyContainer } from "tsyringe"
import type { Provider } from "../providers/types"

export type ModuleInit = (container: DependencyContainer) => void | (() => void)

export type AttachModuleParams = {
    container: DependencyContainer
    factory?: never
    onModuleInit?: never
    providers?: never
}

export type FactoryModuleParams = {
    factory: () => DependencyContainer
    container?: never
    onModuleInit?: ModuleInit
    providers?: Provider[]
}

export type ScopedModuleParams = {
    container?: never
    factory?: never
    onModuleInit?: ModuleInit
    providers?: Provider[]
}

export type UseModuleParams = AttachModuleParams | FactoryModuleParams | ScopedModuleParams

export type ModuleResolution = {
    container: DependencyContainer
    owned: boolean
    cfgCleanup?: () => void
}