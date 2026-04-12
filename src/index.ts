export type {
    ModuleHook,
    ModuleHooks,
    ModuleLifecycle,
    RootModuleParams,
    InheritModuleParams,
    FactoryModuleParams,
    ScopedModuleParams,
    UseModuleParams,
    ModuleResolution,
    ModuleResolutionLifecycle,
    UseModuleResult,
    ModuleProviderProps,
    WithModuleParams,
} from "./module/index.js"
export {
    createModuleResolution,
    resolveContainer,
    useModule,
    useModuleContext,
    useModuleRebuild,
    useContainer,
    cleanupModuleResolution,
    ModuleContext,
    ModuleProvider,
    withModule,
} from "./module/index.js"

export { registerProvider, registerProviders } from "./providers/index.js"
export type {
    ProviderScope,
    OptionalFactoryDependency,
    FactoryDependency,
    ClassProvider,
    ValueProvider,
    FactoryProvider,
    ExistingProvider,
    Provider,
} from "./providers/types.js"

export type { IResolver } from "./resolver/index.js"
export { Resolver, useResolve, useTryResolve } from "./resolver/index.js"

export type { CleanupFn } from "./module-cleanup/index.js"
export { AsyncTeardown, useAsyncTeardown } from "./module-cleanup/index.js"

export type { Constructor, TokenOptions } from "./utils/index.js"
export { tryResolve, resolveOr, di, makeTokenizer, Token } from "./utils/index.js"

export type {
    DependencyContainer,
    InjectionToken,
    RegistrationOptions,
    Frequency,
    Disposable,
} from "./aliases/index.js"
export {
    Container,
    Injectable,
    Singleton,
    Inject,
    InjectAll,
    InjectWithTransform,
    InjectAllWithTransform,
    Delay,
    Scope,
    SingletonFactory,
    ConditionalFactory,
    ScopedFactory,
} from "./aliases/index.js"
