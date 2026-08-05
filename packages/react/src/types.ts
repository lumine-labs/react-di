// Container
// ========================================

export type {
    AbstractConstructor,
    AliasEntrySnapshot,
    BindingEntrySnapshot,
    Constructor,
    EntryMetadata,
    EntrySnapshot,
    Frame,
    InjectionToken,
    RegistrationMode,
    RequestCache,
    ResolveAllMode,
    ResolveMode,
    Scope,
} from "@remodulo/container/types"

// Providers
// ========================================

export type {
    ClassProvider,
    ExistingProvider,
    FactoryProvider,
    Provider,
    SelfClassProvider,
    TokenClassProvider,
    ValueProvider,
} from "./core/provider/provider.types.js"

// Module
// ========================================

export type { ModuleParams } from "./core/module/module.js"

// Features
// ========================================

export type { Feature, ProviderInput } from "./core/feature/feature.js"

// Lifecycle
// ========================================

export type {
    ModuleHook,
    ModuleHooks,
    ProviderLifecycle,
} from "./core/providers/module-lifecycle/module-lifecycle.types.js"

// System providers
// ========================================

export type { PropsAdapter } from "./core/providers/props-ref/props-ref.provider.js"

// React surface
// ========================================

export type { ModuleContextValue } from "./react/context/ModuleContext.js"
export type { ModuleProviderProps } from "./react/providers/ModuleProvider.js"
export type { AppProviderProps } from "./react/providers/AppProvider.js"
export type {
    CreateModuleComponentOptions,
    CreateModuleComponentParams,
} from "./react/factories/createModuleComponent.js"
export type { UsePropsRefOptions, UsePropsRefResult } from "./react/hooks/usePropsRef.js"

// Tokens
// ========================================

export type { TokenOptions, Tokenizer } from "./core/tokenizer/tokenizer.js"
