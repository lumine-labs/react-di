# API Overview

This page documents the current public surface from `@lumelabs/react-di`.

## Entry Points

- `@lumelabs/react-di`
- `@lumelabs/react-di/types`
- `@lumelabs/react-di/core`

## Main Runtime Exports

### React Module API

- `ModuleProvider`
- `withModule`
- `useModule`
- `useModuleContext`
- `useContainer`
- `useModuleRebuild`

### Resolution API

- `Resolver`
- `useResolve`
- `useTryResolve`
- `resolve(container, token, recursive?)`
- `tryResolve(container, token, recursive?)`
- `resolveOr(container, token, fallback, recursive?)`

### System Providers

- `ModuleMetadata`
- `ContainerResolver`
- `UNSAFE_CONTAINER_RESOLVER`
- `AsyncTeardown`
- `useAsyncTeardown`

### Tokenizer

- `makeTokenizer(namespace?)`
- `Token(name, options?)`

### tsyringe Alias Re-exports

- `Container`
- `Injectable`, `Singleton`, `Inject`, `InjectAll`
- `InjectWithTransform`, `InjectAllWithTransform`, `Delay`
- `Scope`
- `SingletonFactory`, `ConditionalFactory`, `ScopedFactory`

## Public Type Exports

### Module Types

- `RootModuleParams`
- `FactoryModuleParams`
- `ScopedModuleParams`
- `InheritModuleParams`
- `ModuleResolutionParams`
- `ModuleResolution`
- `ModuleHook`, `ModuleHooks`
- `ModuleLifecycle`, `ModuleResolutionLifecycle`

### Provider Types

- `Provider`
- `ClassProvider`, `ValueProvider`, `FactoryProvider`, `ExistingProvider`
- `FactoryDependency`, `OptionalFactoryDependency`
- `CleanupFn`

### React Types

- `ModuleProviderProps`
- `WithModuleParams`

### Utility Types

- `TokenOptions`
- `Constructor`
- tsyringe types (`DependencyContainer`, `InjectionToken`, ...)

## Important Notes

- `AsyncTeardown` is optional and must be registered as provider when used.
- In `container` (inherit) mode, `providers`, `id`, and `onModule*` hooks are disallowed.
- Factory providers do not receive container directly; only declared injected dependencies are passed.
