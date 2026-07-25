import { useLazyRef } from "@luminelabs/react-toolkit"
import type { DependencyContainer, InjectionToken } from "../../aliases/index.js"

import { useContainer } from "./useModuleContext.js"
import { resolveAll } from "../../core/resolve.js"

// Types
// ========================================

// One combined snapshot object so inputs and value can never desync: on any input change the WHOLE
// snapshot is replaced (never individual fields).
type ResolveAllSnapshot<T> = {
    container: DependencyContainer
    token: InjectionToken<T>
    recursive: boolean
    value: T[]
}

// Hooks
// ========================================

// Same snapshot semantics as `useResolve`: the resolved array identity is held stable via a lazy ref
// and only recomputed when container/token/recursive change. Resolution runs during render.
export function useResolveAll<T>(token: InjectionToken<T>, recursive = true): T[] {
    const container = useContainer()
    const ref = useLazyRef<ResolveAllSnapshot<T>>(() => ({
        container,
        token,
        recursive,
        value: resolveAll(container, token, recursive),
    }))

    const current = ref.current
    if (current.container !== container || current.token !== token || current.recursive !== recursive) {
        ref.current = { container, token, recursive, value: resolveAll(container, token, recursive) }
    }

    return ref.current.value
}
