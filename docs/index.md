---
layout: home

hero:
    name: "@lumelabs/react-di"
    text: "Scoped DI for React applications"
    tagline: "Immutable module scopes, explicit service wiring, and predictable cleanup lifecycle."
    actions:
        - theme: brand
          text: Documentation
          link: /guide/getting-started
        - theme: alt
          text: GitHub
          link: https://github.com/lumine-labs/react-di

features:
    - title: Module Scopes
      details: Build dependency graphs as nested module containers with local overrides for feature widgets and pages.
    - title: Constructor-first DI
      details: Keep service dependencies explicit and composable with provider-based registration and class-oriented architecture.
    - title: Predictable Teardown
      details: Use CleanupRegistry to coordinate resource cleanup when React unmount order becomes hard to reason about.
    - title: React Integration
      details: Use ModuleProvider and hooks, or wrap screens with withModule HOC when provider composition must stay declarative.
    - title: OOP-friendly
      details: Works naturally with class stores, API clients, and service layers where Context trees become noisy.
    - title: Test-friendly
      details: Override tokens in scoped modules and test components with isolated service graphs and deterministic behavior.
---
