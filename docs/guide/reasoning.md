# Reasoning

`@lumelabs/react-di` exists to solve dependency graph composition in React applications where plain Context becomes hard to scale.

## Why not just Context

- Context is great for value propagation, but manual service graph wiring becomes noisy at scale.
- Overriding dependencies for nested features usually requires additional context layers.
- Lifecycle-sensitive resources (sockets, channels, clients) need predictable teardown orchestration.

## What this package optimizes for

- Scoped module containers with local overrides.
- Explicit dependency wiring with providers.
- Deterministic cleanup flow for module-owned resources.
- Compatibility with class-based architecture and service layers.

## What this package is not

- Not a state manager.
- Not a reactive rendering engine.
- Not a replacement for React Context in simple apps.
