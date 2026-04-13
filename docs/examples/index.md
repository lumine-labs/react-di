# Examples

This section shows practical patterns built with current `@lumelabs/react-di` API.

## Root Module + Resolve

```tsx
import "reflect-metadata"
import { Injectable, ModuleProvider, useResolve } from "@lumelabs/react-di"

@Injectable()
class UserService {
    getName() {
        return "Lumelabs"
    }
}

function View() {
    const users = useResolve(UserService)
    return <div>{users.getName()}</div>
}

export function App() {
    return (
        <ModuleProvider root providers={[UserService]}>
            <View />
        </ModuleProvider>
    )
}
```

## Local Override in Child Module

```tsx
const API_URL = Symbol("API_URL")

<ModuleProvider root providers={[{ provide: API_URL, useValue: "https://api.prod" }]}>
    <ModuleProvider providers={[{ provide: API_URL, useValue: "https://api.preview" }]}>
        <PreviewPanel />
    </ModuleProvider>
</ModuleProvider>
```

## Module Lifecycle Provider

```ts
import { Injectable, type ModuleLifecycle } from "@lumelabs/react-di"

@Injectable()
class SocketService implements ModuleLifecycle {
    onModuleInit() {
        // create socket
    }

    onModuleDestroy() {
        // final cleanup
    }
}
```

## Async Teardown with Priority

```tsx
import { AsyncTeardown, ModuleProvider, useAsyncTeardown } from "@lumelabs/react-di"

function Feature() {
    useAsyncTeardown(async () => {
        await analytics.flush()
    }, 10)

    useAsyncTeardown(() => {
        socket.disconnect()
    }, 1)

    return null
}

<ModuleProvider root providers={[AsyncTeardown]}>
    <Feature />
</ModuleProvider>
```

## Custom Tokenizer Namespace

```ts
import { makeTokenizer } from "@lumelabs/react-di"

const AppToken = makeTokenizer("@app")
export const API_URL = AppToken<string>("API_URL")
```
