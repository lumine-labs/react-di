# Getting Started

## Install

```bash
npm i @lumelabs/react-di
```

## Prerequisite

```tsx
import "reflect-metadata"
```

## Minimal Example

```tsx
import "reflect-metadata"
import { Inject, Injectable, ModuleProvider, useResolve } from "@lumelabs/react-di"

@Injectable()
class ApiClient {
    async get<T>(path: string): Promise<T> {
        const response = await fetch(path)
        if (!response.ok) {
            throw new Error(`Request failed: ${response.status}`)
        }
        return (await response.json()) as T
    }
}

@Injectable()
class UserAPI {
    constructor(@Inject(ApiClient) private readonly apiClient: ApiClient) {}

    getUsers() {
        return this.apiClient.get<{ id: number; name: string }[]>("/api/users")
    }
}

function ExampleFeature() {
    const userAPI = useResolve(UserAPI)

    const loadUsers = async () => {
        const users = await userAPI.getUsers()
        console.log(users)
    }

    return <button onClick={loadUsers}>Load users</button>
}

export function App() {
    return (
        <ModuleProvider root providers={[ApiClient, UserAPI]}>
            <ExampleFeature />
        </ModuleProvider>
    )
}
```

## What Happens Here

- `ModuleProvider` creates an owned root module container.
- `providers` are registered into that container.
- `useResolve` reads dependencies from current module context.

## Next Steps

- Read [What is a Module](/guide/modules).
- Read [ModuleProvider](/guide/module-provider).
- Read [Provider Registration](/guide/providers).
