# Modules / Usage

`ModuleProvider` creates or attaches a module container and exposes it via React context.

## Modes

- `root`: creates a new root child container.
- `factory`: creates a new container using a custom factory.
- `container`: inherits an existing container (no ownership).
- scoped default: creates a child from parent container in context.

## Basic Root Module

```tsx
<ModuleProvider root providers={[MyService]}>
    <Feature />
</ModuleProvider>
```

## Scoped Child Module

```tsx
<ModuleProvider root providers={[ApiClient]}>
    <Page />
</ModuleProvider>

function Page() {
    return (
        <ModuleProvider providers={[FeatureService]}>
            <Feature />
        </ModuleProvider>
    )
}
```

## Inherit Existing Container

```tsx
<ModuleProvider container={externalContainer}>
    <Feature />
</ModuleProvider>
```

In `container` mode:

- `providers` are not allowed.
- `id` is not allowed.
- `onModule*` hooks are not allowed.

## Module Rebuild

Use `useModuleRebuild()` to rebuild owned module resolution.

```tsx
const rebuild = useModuleRebuild()
rebuild()
```

Rebuild creates a fresh owned resolution and re-runs module/provider lifecycle.

## `withModule` HOC

```tsx
import { withModule } from "@lumelabs/react-di"

const FeatureWithModule = withModule(Feature, { root: true, providers: [MyService] })
```
