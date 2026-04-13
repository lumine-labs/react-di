# What is a Provider

A provider is a registration rule that tells the container how to resolve a token.

## Why Providers Matter

- They make service graphs explicit.
- They enable local overrides in child modules.
- They improve testability by allowing token-level replacement.

## Provider Forms

1. Constructor provider (`MyService`)
2. `useClass` (`{ provide, useClass }`)
3. `useValue` (`{ provide, useValue }`)
4. `useFactory` (`{ provide, useFactory, inject? }`)
5. `useExisting` (`{ provide, useExisting }`)

## Scope Behavior

Scope controls instance lifetime:

- `singleton`
- `transient`
- `containerScoped`
- `resolutionScoped` (except `useFactory`)

## Lifecycle and Providers

Providers that resolve to objects implementing:

- `onModuleInit`
- `onModuleMount`
- `onModuleUnmount`
- `onModuleDestroy`

are automatically included in provider lifecycle execution for owned modules.

`useExisting` providers are excluded from lifecycle token collection to avoid duplicate lifecycle calls through alias tokens.

## Where Providers Are Used

- `ModuleProvider` accepts `providers` and registers them in module scope.
- Child modules can shadow parent tokens.

Next: [Provider Registration](/guide/providers), [Resolver](/guide/resolver), [Async Teardown](/guide/cleanup-registry)
