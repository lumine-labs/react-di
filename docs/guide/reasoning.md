# Reasoning

`@lumelabs/react-di` exists to solve dependency graph composition in React applications where plain Context wiring becomes hard to scale.

## Why not only Context

- Context is excellent for value propagation, but large dependency graphs become repetitive to wire manually.
- Local overrides for nested features often lead to deep, hard-to-maintain provider trees.
- Lifecycle-sensitive dependencies (clients, sockets, workers) need explicit init/mount/unmount/destroy flow.

## What This Library Optimizes For

- Module containers as architecture boundaries.
- Explicit provider registration and constructor injection.
- Provider lifecycle orchestration per module resolution.
- Predictable teardown of async resources.
- Compatibility with class-oriented OOP service design.

## What This Library Is Not

- Not a state manager.
- Not a reactive rendering engine.
- Not a replacement for React Context in simple cases.
- Not a custom DI engine (it builds on `tsyringe`).
