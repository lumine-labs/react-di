# @luminelabs/react-di

Module-oriented dependency injection for React, built on [Inversify](https://inversify.io/).

> ⚠️ **Experimental / Internal Use**
>
> Primarily intended for personal and internal use. It may change, break, or be
> restructured at any time. Don't rely on it for public projects unless you're
> prepared to maintain your own fork.

## [Documentation](https://lumine-labs.github.io/react-di/)

## Why?

React gives great UI composition, but complex apps still need an explicit ownership layer with dependency graphs and controlled object lifecycles.  
This package provides that missing layer without turning DI into a state manager.

## Quick Features

- DI containers scoped to your component tree — modules mount, unmount and die with their subtrees
- One composition root (`new App()`) + nested `<ModuleProvider>` boundaries, resolution walks up the chain
- Constructor injection for plain classes — services never import React
- Strict four-phase lifecycle (`init → mount → unmount → destroy`), tree-ordered, LIFO teardown
- Declarative rebuilds — `rebuildOn={[deps]}` replaces a module's container and instances when inputs change
- Full provider grammar: class / value / factory / alias, singleton + transient scopes, lazy construction
- Compile-time provider safety — mixing implementation keys or missing tokens fails in TypeScript and loudly at runtime
- Hooks: `useResolve`, `useResolveSafe`, `useResolveAll`, `useModule`, `useContainer`, `useModuleRebuild`, `usePropsRef`
- Props bridging into services (`PropsRef`) for module boundaries driven by component props
- Strict error semantics — failed init/mount propagates to your ErrorBoundary, teardown is fail-safe, nothing fails silently
- SSR-ready — `renderToString` + hydration work out of the box
- No reactivity opinions — object identity and lifetimes are managed here, state and rendering stay yours
- ~500 tests pinning lifecycle ordering, Suspense/concurrency behavior and memory collectibility

## License

MIT
