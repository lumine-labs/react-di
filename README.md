# @lumelabs/react-di

[Documentation (WIP)](https://lumine-labs.github.io/react-di/)

Dependency Injection for React, built on top of `tsyringe`.

`@lumelabs/react-di` brings module-oriented DI into React applications: containers, module boundaries, subtree scoping, and predictable lifecycle orchestration for services.

## Why This Library Exists

React gives great UI composition, but complex apps still need explicit dependency graphs and controlled object lifecycles.  
This package provides that missing layer without turning DI into a state manager.

## What It Focuses On

- Full DI container workflow in React context.
- Modular architecture with nested module trees.
- Provider registration ergonomics for real project structure.
- Lifecycle-driven service orchestration at module level.
- Compatibility with class-based OOP service design in frontend apps.

## Philosophy

DI here is about dependency graph and lifecycle management.  
Reactivity belongs to dedicated tools (MobX, RxJS, Zustand, etc.), not to the DI container itself.

## Project Status

Active development. API is evolving toward a stable `1.x` baseline.

Work in Progress docs: [lumine-labs.github.io/react-di](https://lumine-labs.github.io/react-di/)
