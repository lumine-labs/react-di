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
import { Resolver } from "@lumelabs/react-di"

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

## UNSAFE Container Access

For edge cases only:

- Inject `UNSAFE_CONTAINER_RESOLVER`
- Call `unsafe_getContainer()`

This is an explicit anti-pattern escape hatch and should not be used as primary app architecture.
