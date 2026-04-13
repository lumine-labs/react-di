# ModuleProvider

`ModuleProvider` creates or attaches a module container and exposes it via React context.

## Props Overview

- `root?: true`
- `factory?: () => DependencyContainer`
- `container?: DependencyContainer`
- `id?: string` (owned modes only)
- `providers?: Provider[]` (owned modes only)
- `onModuleInit?: (container) => void` (owned modes only)
- `onModuleMount?: (container) => void` (owned modes only)
- `onModuleUnmount?: (container) => void` (owned modes only)
- `onModuleDestroy?: (container) => void` (owned modes only)
- `children?: ReactNode`

## Lifecycle Order

For owned module resolutions:

1. `module.onModuleInit`
2. `providers.onModuleInit` (FIFO)
3. `module.onModuleMount`
4. `providers.onModuleMount` (FIFO)
5. `providers.onModuleUnmount` (LIFO)
6. `module.onModuleUnmount`
7. `AsyncTeardown.run()` if `AsyncTeardown` is registered
8. `providers.onModuleDestroy` (LIFO)
9. `module.onModuleDestroy`
10. `container.dispose()`

## Hook Bridge Behavior

`onModule*` callbacks passed as props are wrapped with stable event handlers internally.

- Identity stays stable for lifecycle engine.
- Closure values stay up to date with current React render state.

## Context Access

Inside a module subtree:

- `useModuleContext()` gives `{ container, owned, id, rebuild }`.
- `useContainer()` returns current container.
- `useModuleRebuild()` rebuilds current module resolution.
