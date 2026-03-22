# Getting Started

## Install

```bash
npm i @lumelabs/react-di
```

## Basic Usage

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

## Notes

- `useResolve` resolves dependency from current module container.
- Module containers are immutable after mount.
- If you need a full rebuild of module dependencies, remount with React `key`.
