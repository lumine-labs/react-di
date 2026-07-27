// Container
// ========================================

export type {
    AbstractConstructor,
    ClassProvider,
    Constructor,
    ExistingProvider,
    FactoryDependency,
    FactoryProvider,
    InjectionToken,
    OptionalFactoryDependency,
    Provider,
    Scope,
    ValueProvider,
} from "./container/container.types.js"

// Module resolution
// ========================================

export type {
    FactoryModuleParams,
    ModuleResolution,
    ModuleResolutionParams,
    RootModuleParams,
    ScopedModuleParams,
} from "./core/module/resolution.types.js"

// Lifecycle
// ========================================

export type {
    ModuleErrorHook,
    ModuleHook,
    ModuleHooks,
    ModulePhase,
    ProviderLifecycle,
} from "./core/providers/module-lifecycle/module-lifecycle.types.js"

// System providers
// ========================================

export type { ModuleMetadataInit, ModuleMetadataProvider } from "./core/providers/module-metadata/module-metadata.provider.js"
export type { PropsAdapter } from "./core/providers/props-ref/props-ref.provider.js"

// React surface
// ========================================

export type { ModuleContextValue } from "./react/context/ModuleContext.js"
export type { ModuleProviderProps } from "./react/providers/ModuleProvider.js"
export type { CreateModuleOptions, CreateModuleParams } from "./react/factories/createModule.js"
export type { UsePropsRefOptions, UsePropsRefResult } from "./react/hooks/usePropsRef.js"

// Tokens
// ========================================

export type { TokenOptions, Tokenizer } from "./core/tokenizer/tokenizer.js"
