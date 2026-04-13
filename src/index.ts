// Aliases
// ========================================

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

// Module resolution - Provider, HOC, Hooks
// ========================================

export { ModuleProvider } from "./react/providers/ModuleProvider.js"

export { withModule } from "./react/hoc/withModule.js"

export { useModule } from "./react/hooks/useModule.js"
export { useContainer, useModuleContext, useModuleRebuild } from "./react/hooks/useModuleContext.js"

// Resolver
// ========================================

export { Resolver } from "./core/providers/resolver/resolver.js"
export {
    ContainerResolver,
    UNSAFE_CONTAINER_RESOLVER,
} from "./core/providers/container-resolver/container-resolver.js"
export { useResolve, useTryResolve } from "./react/hooks/useResolve.js"

// Async Teardown
// ========================================

export { AsyncTeardown } from "./core/providers/async-teardown/async-teardown.js"
export { useAsyncTeardown } from "./react/hooks/useAsyncTeardown.js"

// Tokenizer
// ========================================

export { makeTokenizer, Token } from "./core/tokenizer/tokenizer.js"

// Utils
// ========================================

export { resolve, tryResolve, resolveOr } from "./shared/container-utils.js"

// Public types
// ========================================

export * from "./types.js"
