# @remodulo/mobx

MobX companion for [`@remodulo/react`](https://github.com/lumine-labs/remodulo).

`@remodulo/react` keeps its `PropsRef`/`usePropsRef` props bridge reactivity-agnostic: the default
mode just rewrites props in place, and a `PropsAdapter` lets a reactive layer own the bridged value
instead. This package is that adapter for MobX — it turns bridged props into a MobX observable that
survives updates in place, so reactions/`autorun`s attached to it keep tracking across every props
change.

## Install

```sh
npm install @remodulo/mobx mobx @remodulo/react react
```

`@remodulo/react`, `mobx`, and `react` are peer dependencies — install them alongside this package
in your app (see [Peer dependencies](#peer-dependencies)).

## Status

Early scaffold. One export today, `mobxProps` — a `PropsAdapter` factory for MobX, used via
`usePropsRef`'s or `createModuleComponent`'s `adapter` option. See `agent-notes/` for the working notes,
decisions, and roadmap.

## Peer dependencies

`@remodulo/react`, `mobx`, and `react` must be peer dependencies, never direct dependencies of this
package — a duplicated `@remodulo/react` copy means a duplicated `PropsRef` injection token (silently broken
resolution), and MobX has global reaction/transaction state with the same duplicate-copy hazard. Keep a
single copy of each in your app's `node_modules`.
