export type {
    ModuleInit,
    RootModuleParams,
    InheritModuleParams,
    FactoryModuleParams,
    ScopedModuleParams,
    UseModuleParams,
    ModuleResolution,
} from "./module/types.js"

export type { ModuleProviderProps } from "./module/ModuleProvider.js"
export type { WithModuleParams } from "./module/withModule.js"

export type {
    Scope,
    OptionalFactoryDependency,
    FactoryDependency,
    ClassProvider,
    ValueProvider,
    FactoryProvider,
    ExistingProvider,
    Provider,
} from "./providers/types.js"

export type { IResolver } from "./resolver/resolver.js"
export type { CleanupFn, CleanupMode, CleanupOptions } from "./module-cleanup/types.js"

export type { Constructor } from "./utils/types.js"
export type {
    DependencyContainer,
    InjectionToken,
    RegistrationOptions,
    Frequency,
    Disposable,
} from "./aliases/index.js"
