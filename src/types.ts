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
    FactoryModuleParams,
    ScopedModuleParams,
    ModuleResolutionParams,
    ModuleResolution,
} from "./core/module/resolution.types.js"
export type {
    ModuleHook,
    ModuleHooks,
    ProviderLifecycle,
} from "./core/providers/module-lifecycle/module-lifecycle.types.js"

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
export type { CleanupFn } from "./core/providers/async-teardown/async-teardown.provider.js"

export type { ProviderScope } from "./core/providers/providers.types.js"

// Props bridge types
// ========================================

export type { PropsAdapter } from "./core/providers/props-ref/props-ref.provider.js"

// React surface types
// ========================================

export type { ModuleProviderProps } from "./react/providers/ModuleProvider.js"
export type { CreateModuleParams, CreateModuleOptions } from "./react/factories/createModule.js"
export type { ModuleContextValue } from "./react/context/ModuleContext.js"
export type { UsePropsRefOptions, UsePropsRefResult } from "./react/hooks/usePropsRef.js"

// Tokenizer types
// ========================================

export type { TokenOptions, Tokenizer } from "./core/tokenizer/tokenizer.js"

// Shared types
// ========================================

export type { Constructor } from "./shared/types.js"
