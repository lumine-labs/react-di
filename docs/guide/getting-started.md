# Getting Started

## Install

```bash
npm i @lumelabs/react-di
```

## Basic Usage

```tsx
import { ModuleProvider, useResolve, type Provider } from "@lumelabs/react-di"

class CounterService {
    value = 0
    inc() {
        this.value += 1
        return this.value
    }
}

const providers: Provider[] = [CounterService]

function Counter() {
    const counter = useResolve(CounterService)
    return <button onClick={() => counter.inc()}>Increment</button>
}

export function App() {
    return (
        <ModuleProvider root providers={providers}>
            <Counter />
        </ModuleProvider>
    )
}
```

## Notes

- Module containers are immutable after mount.
- If you need a full rebuild of module dependencies, remount with React `key`.
