# What is a Module

In `@lumelabs/react-di`, a module is a scoped dependency container.

## Core idea

- A module owns a local dependency graph.
- Child modules can inherit from parent modules.
- Child modules can override specific dependencies without touching parent graph.

## Why it matters

- You can isolate feature widgets or page-level services.
- You can keep a stable root graph and override only what a nested feature needs.
- You can avoid deep context trees for service wiring.

## Module lifecycle

- Module is created once on mount.
- Module container is immutable during its lifetime.
- To rebuild a module graph, remount the module (for example using React `key`).

## Parent and child modules

- Parent module provides shared dependencies.
- Child module can resolve parent dependencies recursively.
- Child module can register local providers and shadow parent tokens.

## Register providers in module

```tsx
<ModuleProvider root providers={[ApiClient, UserAPI]}>
    <Feature />
</ModuleProvider>
```

Read more on Providers [here](/guide/providers).

## Typical use cases

- Feature-level API endpoints (preview vs production).
- Isolated store instances for repeated widgets.
- Local overrides for tests and stories.

Next step: see [Modules / Usage](/guide/modules-usage).
