// Alias types
// ========================================

export type {
    DependencyContainer,
    InjectionToken,
    RegistrationOptions,
    Frequency,
    Disposable,
} from "./aliases/index.js"

// Core module types
// ========================================

export type {
    RootModuleParams,
    InheritModuleParams,
    FactoryModuleParams,
    ScopedModuleParams,
    ModuleResolutionParams,
    ModuleResolution,
} from "./core/module/resolution.types.js"
export type {
    ModuleHook,
    ModuleHooks,
    ModuleLifecycle,
    ModuleResolutionLifecycle,
} from "./core/module/lifecycle.types.js"

// Core provider types
// ========================================

export type {
    OptionalFactoryDependency,
    FactoryDependency,
    ClassProvider,
    ValueProvider,
    FactoryProvider,
    ExistingProvider,
    Provider,
} from "./core/providers/providers.types.js"
export type { CleanupFn } from "./core/providers/async-teardown/async-teardown.js"

// React surface types
// ========================================

export type { ModuleProviderProps } from "./react/providers/ModuleProvider.js"
export type { WithModuleParams } from "./react/hoc/withModule.js"

// Tokenizer types
// ========================================

export type { TokenOptions } from "./core/tokenizer/tokenizer.js"

// Shared types
// ========================================

export type { Constructor } from "./shared/types.js"
