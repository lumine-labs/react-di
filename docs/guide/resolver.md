# Resolver

`Resolver` is a dynamic escape hatch for runtime resolution.

Use constructor injection by default. Use resolver only when token is chosen dynamically.

## Methods

- `resolve(token)` throws when token is missing.
- `tryResolve(token)` returns `undefined` for unregistered token.

## Example

```ts
import { Resolver } from "@lumelabs/react-di"

class DynamicHandler {
    constructor(private readonly resolver: Resolver) {}

    run(token: symbol) {
        return this.resolver.tryResolve(token)
    }
}
```
