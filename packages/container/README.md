# @remodulo/container

**The dependency injection container behind [Remodulo](https://lumine-labs.github.io/remodulo/).**

Zero runtime dependencies. No decorators, no `reflect-metadata`, no compiler flags — plain classes and
ordinary function calls.

> ⚠️ **Experimental / internal use.**
>
> Primarily intended for personal and internal use. It may change, break, or be restructured at any time.
> Don't rely on it for public projects unless you're prepared to maintain your own fork.

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
        this.logger.log("hello")
    }
}

const container = new Container()
container.register([Logger, Service])
const service = container.resolve(Service)
service.greet()
```

## Ambient injection

`inject()` reads an **ambient construction frame** — a synchronous reference to the container currently
building. It works in a constructor body, in a field initializer and inside a `useFactory`, which is why no
decorator is needed to describe a dependency: the call site *is* the declaration.

Four functions read the frame: `inject`, `injectOptional`, `injectAll` and `injectContainer`.
`runInInjectionContext` opens a frame by hand, outside a resolution.

## What's in the box

- **Providers** — `useClass`, `useValue`, `useFactory`, `useExisting`, plus the bare-constructor shorthand.
- **Scopes** — `singleton`, `transient`, `request`.
- **Collections** — `multi: true` registrations, read back with `injectAll` / `resolveAll`.
- **Modes** — every read is parameterized over where it looks: `self`, `nearest`, and `chained` for
  collections.
- **Typed errors** — `RegistrationError`, `ResolutionError`, `CycleError` and `InjectionContextError`, each
  carrying a stable error code.
- **Hierarchy** — `fork()` a child container; registrations and lookups follow the chain.

## [Documentation](https://lumine-labs.github.io/remodulo/)

For the React integration — modules as ownership boundaries, lifecycle bound to the component tree — see
[`@remodulo/react`](https://www.npmjs.com/package/@remodulo/react).
