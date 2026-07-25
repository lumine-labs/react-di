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
} from "./aliases/index.js"

// Module resolution - Provider, Factory
// ========================================

export { ModuleProvider } from "./react/providers/ModuleProvider.js"

export { createModule } from "./react/factories/createModule.js"

// Module hooks
// ========================================

export { useModule } from "./react/hooks/useModule.js"
export { useContainer, useModuleContext, useModuleRebuild } from "./react/hooks/useModuleContext.js"
export { usePropsRef } from "./react/hooks/usePropsRef.js"

// System providers
// ========================================
export { ModuleMetadata } from "./core/providers/module-metadata/module-metadata.provider.js"
export { PropsRef } from "./core/providers/props-ref/props-ref.provider.js"

// Resolver
// ========================================
export { Resolver } from "./core/providers/resolver/resolver.provider.js"
export { useResolve, useTryResolve } from "./react/hooks/useResolve.js"
export { useResolveAll } from "./react/hooks/useResolveAll.js"

// Async Teardown
// ========================================

export { AsyncTeardown } from "./core/providers/async-teardown/async-teardown.provider.js"
export { useAsyncTeardown } from "./react/hooks/useAsyncTeardown.js"

// Tokenizer
// ========================================

export { makeTokenizer, Token } from "./core/tokenizer/tokenizer.js"

// Utils
// ========================================

export { resolve, tryResolve, resolveAll, resolveOr } from "./core/resolve.js"

// Public types
// ========================================

export type * from "./types.js"
