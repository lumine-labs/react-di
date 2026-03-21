# ModuleProvider

`ModuleProvider` creates or attaches a module container and exposes it via React context.

## Modes

- `root`: creates a new root child container.
- `factory`: creates a new container using a custom factory.
- `container`: inherits an existing container (no ownership).
- scoped default: creates a child from parent container in context.

## Example

```tsx
<ModuleProvider root providers={[MyService]}>
    <Feature />
</ModuleProvider>
```

## `withModule` HOC

For wrapper-style composition:

```tsx
import { withModule } from "@lumelabs/react-di"

const FeatureWithModule = withModule(Feature, { root: true, providers: [MyService] })
```
