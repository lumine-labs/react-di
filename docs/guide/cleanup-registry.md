# Async Teardown

`AsyncTeardown` is an optional provider for ordered async cleanup at module destroy time.

> Note: This page keeps its legacy URL for backward compatibility.

## Why It Exists

- React unmount order can be difficult in complex trees.
- Some resources need deterministic teardown priority.
- Teardown can be async and should not crash module cleanup on failure.

## Behavior

- Register callbacks: `add(cleanup, priority?)`
- Higher priority runs earlier.
- Same-priority callbacks run in parallel (`Promise.all`).
- Errors are caught and logged (`console.error`), cleanup continues.
- `run()` is idempotent while active (reuses ongoing promise).

## Register Provider

`AsyncTeardown` is **not** auto-registered by default.

```tsx
<ModuleProvider root providers={[AsyncTeardown, SocketService]}>
    <Feature />
</ModuleProvider>
```

## Hook API

Use `useAsyncTeardown(cleanup, priority?)` inside module subtree:

```tsx
import { useAsyncTeardown } from "@lumelabs/react-di"

const off = useAsyncTeardown(() => {
    socket.disconnect()
}, 10)

// Optional manual unregister before unmount:
off()
```

The hook throws if `AsyncTeardown` is not resolvable in current module tree.
