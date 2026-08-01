# Resolver

`Resolver` is a runtime resolution helper registered in every owned module.

Use constructor injection by default. Use resolver only when token is chosen dynamically.

## Methods

- `resolve(token, recursive = true)` throws when token is missing.
- `tryResolve(token, recursive = true)` returns `undefined` for unregistered token.

`recursive = true` searches parent containers.  
`recursive = false` only checks current module container.

## Example

```ts
import { Resolver } from "@remodulo/react"

class DynamicHandler {
    constructor(private readonly resolver: Resolver) {}

    run(token: symbol, localOnly = false) {
        return this.resolver.tryResolve(token, !localOnly)
    }
}
```

## React Hooks Variant

- `useResolve(token, recursive?)`
- `useTryResolve(token, recursive?)`

Both hooks resolve from current module context container.

## Container Access via ModuleMetadata

Containers are internal currency: services should depend on their injected dependencies, not on the
container. For the rare introspection/infrastructure case (plugins, DevTools) that genuinely needs the
container, inject `ModuleMetadata` — the single public door:

```ts
import { ModuleMetadata } from "@remodulo/react"

class Introspector {
    constructor(private readonly meta: ModuleMetadata) {}

    // meta.container — own container; meta.parent — lifecycle parent; meta.children — attached children
}
```

`container`/`parent`/`children` are an infrastructure surface. Mutating a container you did not create is
undefined behavior. Never use `ModuleMetadata.providers` for resolution decisions — ask the container
(`isRegistered`/`resolve`); it is a declared, capture-only snapshot that cannot see dynamic
registrations or parent-chain lookups.
