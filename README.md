# @lumelabs/react-di

> ⚠️ **Experimental / Internal Use Only**
>
> This configuration is primarily intended for personal and internal use.
> It may change, break, or be restructured at any time without notice.
>
> **Do not rely on this package for production or public projects unless you are prepared to maintain your own fork.**
>
> **Issues and feature requests may be closed without response.**

Lightweight non-reactive DI for React on top of `tsyringe`.

## Principles

- DI is composition/lifecycle transport, not a reactive state layer.
- Reactivity belongs to MobX/Effector/RxJS/etc.
- Container scopes map to React subtree boundaries.
- Module instances are immutable after mount. To rebuild module, remount provider (`key`).

## Core API

- `ModuleProvider`: universal module provider (`attach`/`factory`/`scoped`) with `providers[]` + `onModuleInit`.
- `useModule`: low-level immutable module resolution.
- `useModuleContainer`: managed lifecycle wrapper around `useModule`.
- `useResolve`, `useTryResolve`: resolve hooks.

## Provider definition

- `Provider` can be a class constructor (default singleton).
- Or explicit definition:

```ts
{
    provide: Token,
        provider
:
    ServiceClass | {useClass} | {useToken} | {useValue} | {useFactory},
        scope ? : "singleton" | "transient" | "containerScoped" | "resolutionScoped"
}
```

- Default `scope` is `"singleton"`.
- For `useFactory`, only `"transient"` is allowed directly (for singleton-like factory behavior use tsyringe caching
  helpers).

## Notes

- `providers` are applied inside `useModule` while creating an owned container.
- In `attach` mode, `providers`/`onModuleInit` are disallowed.
- `useTryResolve` returns `undefined` only for direct `unregistered token` errors and rethrows other resolution errors.
- `IResolver.tryResolve` is recursive (walks parent chain).
- `IResolver.resolveScoped` / `tryResolveScoped` are current-scope only.