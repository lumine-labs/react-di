# @remodulo/container

**A lightweight Dependency Injection container for modern TypeScript and JavaScript.**

No decorators. No `reflect-metadata`. No compiler transforms. Just plain classes and ordinary function calls.

> ⚠️ **Experimental / internal use**
>
> This package is primarily developed as the foundation of Remodulo and is not yet considered stable.
> Breaking changes may happen until the first stable release.

## Install

```sh
npm install @remodulo/container
```

## Example

```ts
import { Container, inject } from "@remodulo/container"

class Logger {
    log(message: string): void {
        console.log(message)
    }
}

class Service {
    private readonly logger = inject(Logger)

    greet(): void {
        this.logger.log("Hello!")
    }
}

const container = new Container()

container.register([
    Logger,
    Service,
])

container.resolve(Service).greet()
```

## Features

- 🚫 No decorators or `reflect-metadata`
- 📦 Zero runtime dependencies
- 🌳 Hierarchical containers via `fork()`
- 🔁 Singleton, transient and request scopes
- 📚 Multi-bindings (`injectAll`, `resolveAll`)
- 🏭 Class, value, factory and alias providers
- ⚡ Ambient `inject()` API for classes and factories
- 🛡️ Strict registration validation with typed errors

## Injection model

`inject()` works by reading the **current construction frame**.

Whenever the container constructs an object, it exposes itself as the active injection context. That allows dependencies to be declared directly where they're used:

```ts
class Service {
    private readonly logger = inject(Logger)
}
```

The same API also works inside factory providers.

## Documentation

See the full documentation at:

https://lumine-labs.github.io/remodulo/

For the React integration built on top of this container, see **@remodulo/react**.