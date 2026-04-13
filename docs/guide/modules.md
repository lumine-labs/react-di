# What is a Module

In `@lumelabs/react-di`, a module is a scoped dependency container with explicit ownership and lifecycle behavior.

## Core Idea

- Owned module: creates its own container and registers providers.
- Inherited module: attaches to an external container without ownership.
- Scoped module: creates child container from parent module in context.

## Why It Matters

- Isolate page/feature/service graphs.
- Override local dependencies without mutating parent graph.
- Keep container boundaries explicit in large trees.

## Module Lifecycle

- Init phase: module and provider `onModuleInit`.
- Mount phase: module and provider `onModuleMount`.
- Unmount phase: provider (LIFO) then module `onModuleUnmount`.
- Destroy phase: async teardown, provider (LIFO), module `onModuleDestroy`, container `dispose`.

## Container Ownership

- `owned: true` means this module is responsible for lifecycle + disposal.
- `owned: false` means container is inherited and lifecycle for this resolution is skipped.

## Module Metadata

Every owned module registers `ModuleMetadata` with a string `id`.

- Custom id: pass `id` in module params.
- Auto id: generated internally if not provided.

## System Providers

Owned modules automatically register:

- `Resolver`
- `ModuleMetadata`
- `UNSAFE_CONTAINER_RESOLVER` (explicit escape hatch)

`AsyncTeardown` is optional and should be added explicitly via `providers` when needed.

Next: [Modules / Usage](/guide/modules-usage)
