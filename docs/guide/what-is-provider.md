# What is a Provider

A provider is a registration rule that tells module container how to resolve a dependency token.

## Why providers exist

- They describe how a dependency should be created or mapped.
- They let you swap implementations per module scope.
- They keep service graph explicit and testable.

## Provider forms

- Constructor provider: register class directly.
- `useClass`: map token to class.
- `useValue`: map token to static value.
- `useFactory`: build instance manually with container access.
- `useExisting`: alias one token to another token.

## Scope behavior

Provider scope controls instance lifetime:

- `singleton`
- `transient`
- `containerScoped`
- `resolutionScoped` (not supported for factory provider in this package)

## Where providers are used

- `ModuleProvider` accepts `providers` and registers them in module scope.
- Child modules can override providers from parent module.

Next: see [Resolver](/guide/resolver) and [Cleanup Registry](/guide/cleanup-registry).
