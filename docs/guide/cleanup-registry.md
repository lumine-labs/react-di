# Cleanup Registry

`CleanupRegistry` provides ordered teardown outside React effect ordering quirks.

## Features

- Register cleanup callbacks with `add`.
- Supports `serial` and `parallel` modes.
- `run()` executes `parallel` first, then `serial` in reverse order.
- Errors are isolated and logged.

## Hook

```tsx
import { useModuleCleanup } from "@lumelabs/react-di"

useModuleCleanup(container, () => {
    socket.disconnect()
})
```
