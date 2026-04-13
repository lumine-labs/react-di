---
layout: home

hero:
    name: "@lumelabs/react-di"
    text: "Module-oriented DI for React"
    tagline: "Built on tsyringe with nested module scopes, provider lifecycle, and explicit dependency graphs."
    actions:
        - theme: brand
          text: Documentation
          link: /guide/getting-started
        - theme: alt
          text: API Overview
          link: /api/
        - theme: alt
          text: GitHub
          link: https://github.com/lumine-labs/react-di

features:
    - title: Scoped Module Tree
      details: Compose DI as a tree of module containers and override dependencies locally without mutating parent modules.
    - title: Provider Lifecycle
      details: Run onModuleInit/onModuleMount/onModuleUnmount/onModuleDestroy for module-owned providers in deterministic order.
    - title: Async Teardown
      details: Coordinate async cleanup tasks with priority-based batching through AsyncTeardown.
    - title: React Integration
      details: Use ModuleProvider, hooks, and withModule HOC while keeping React rendering concerns separate from DI concerns.
    - title: Token Namespaces
      details: Create strict namespaced tokens with makeTokenizer for large apps and shared package boundaries.
    - title: Escape Hatches
      details: Includes explicit UNSAFE container access for rare edge cases and infrastructure tooling.
---
