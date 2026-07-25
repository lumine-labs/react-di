# API Overview

This page documents the current public surface from `@luminelabs/react-di`.

## Entry Points

- `@luminelabs/react-di`
- `@luminelabs/react-di/types`
- `@luminelabs/react-di/core`

## Main Runtime Exports

### React Module API

- `ModuleProvider`
- `createModule`
- `useModule`
- `useModuleContext`
- `useContainer`
- `useModuleRebuild`
- `usePropsRef`

### Resolution API

- `Resolver`
- `useResolve`
- `useTryResolve`
- `useResolveAll`
- `resolve(container, token, recursive?)`
- `tryResolve(container, token, recursive?)`
- `resolveAll(container, token, recursive?)`
- `resolveOr(container, token, fallback, recursive?)`

### System Providers

- `ModuleMetadata` (single public container door: `container`/`parent`/`children`/`providers`)
- `PropsRef`
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
- `ProviderLifecycle`

### Provider Types

- `Provider`
- `ClassProvider`, `ValueProvider`, `FactoryProvider`, `ExistingProvider`
- `FactoryDependency`, `OptionalFactoryDependency`
- `CleanupFn`

### React Types

- `ModuleProviderProps`
- `CreateModuleParams`
- `PropsAdapter`

### Utility Types

- `TokenOptions`
- `Constructor`
- tsyringe types (`DependencyContainer`, `InjectionToken`, ...)

## Important Notes

- `AsyncTeardown` is optional and must be registered as provider when used.
- In `container` (inherit) mode, `providers`, `id`, and `onModule*` hooks are disallowed.
- Factory providers do not receive container directly; only declared injected dependencies are passed.
