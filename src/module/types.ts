import type { DependencyContainer } from "../aliases/index.js"
import type { Provider } from "../providers/types.js"

export type ModuleInit = (container: DependencyContainer) => void | (() => void)

export type RootModuleParams = {
    root: true
    container?: never
    factory?: never
    onModuleInit?: ModuleInit
    providers?: Provider[]
}

export type InheritModuleParams = {
    container: DependencyContainer
    root?: never
    factory?: never
    onModuleInit?: never
    providers?: never
}

export type FactoryModuleParams = {
    factory: () => DependencyContainer
    root?: never
    container?: never
    onModuleInit?: ModuleInit
    providers?: Provider[]
}

export type ScopedModuleParams = {
    root?: never
    container?: never
    factory?: never
    onModuleInit?: ModuleInit
    providers?: Provider[]
}

export type UseModuleParams = RootModuleParams | InheritModuleParams | FactoryModuleParams | ScopedModuleParams

export type ModuleResolution = {
    container: DependencyContainer
    owned: boolean
    cleanup?: () => void
}
