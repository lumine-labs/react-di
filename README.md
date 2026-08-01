# Remodulo is...

**Modular ownership runtime for React.**

Ownership boundaries, dependency injection, and deterministic lifecycle for applications that outgrow component-local
state.

###

> ⚠️ **Experimental / Internal Use**
>
> Primarily intended for personal and internal use. It may change, break, or be
> restructured at any time. Don't rely on it for public projects unless you're
> prepared to maintain your own fork.

## [Documentation](https://lumine-labs.github.io/remodulo/)

## Why?

React is excellent at composing UI, but intentionally leaves ownership of application objects to the developer.

As applications grow, service lifetimes, subscriptions, effects, dependency graphs, and resource cleanup become
scattered across components.

**Remodulo introduces modules as explicit ownership boundaries.**

A module owns its dependency graph, resources, and lifecycle, and is destroyed together with the React subtree it represents.
## Why Remodulo?

- **Explicit ownership** - every module owns its dependency graph and lifecycle.
- **Deterministic lifecycle** - `init → mount → unmount → destroy`, synchronized with the React component tree.
- **Scoped dependency injection** - constructor injection without global service locators or prop drilling.
- **Modular composition** - build applications from isolated, composable feature modules.
- **Minimal Context usage** - Context becomes a module implementation detail rather than the primary application architecture.
## Concept

```text
React Component Tree

<AppProvider>
└── <App>
    │
    ├── <AuthModule>
    │      ├── AuthService
    │      ├── SessionStore
    │      └── TokenCache
    │
    └── <ChatModule>
           ├── ChatService
           ├── ChatStore
           └── MessageApi
```

Each module owns its dependency graph, lifecycle, and resources.
When the UI subtree disappears, everything it owns disappears with it.

## Quick Example

```tsx
import { App, AppProvider, ModuleProvider, useResolve } from "@remodulo/react"

@Injectable()
class UserApi {
    // ...
}

@Injectable()
class UserStore {
    constructor(private readonly api: UserApi) {}
    
    onModuleMount() {
        void this.load()
    }

    async load() {
        // ...
    }
}

function Users() {
    const store = useResolve(UserStore)

    return <UsersTable store={store} />
}

const app = new App()

export function Root() {
    return (
        <AppProvider app={app}>
            <ModuleProvider providers={[UserApi, UserStore]}>
                <Users />
            </ModuleProvider>
        </AppProvider>
    )
}
```

## Remodulo is **not**:

- a state manager
- a routing library
- a data fetching library

It focuses on one thing: **ownership of application objects and their lifetime.** 

Use MobX, Redux, Zustand, React Query, or any other library you prefer.

Remodulo manages ownership.
Your state management, rendering, and data fetching remain entirely your choice.

## [Documentation](https://lumine-labs.github.io/remodulo/)

## License

MIT
