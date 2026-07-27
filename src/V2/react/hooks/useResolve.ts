import { useLazyRef } from "@luminelabs/react-toolkit"

import type { Container, InjectionToken } from "../../container"
import { useContainer } from "./useModuleContext.js"

// Types
// ========================================

type ResolveSnapshot<T> = {
    container: Container
    token: InjectionToken<T>
    recursive: boolean
    value: T
}

// Hooks
// ========================================

export function useResolve<T>(token: InjectionToken<T>, recursive = true): T {
    const container = useContainer()
    const ref = useLazyRef<ResolveSnapshot<T>>(() => ({
        container,
        token,
        recursive,
        value: container.resolve(token, recursive),
    }))

    const current = ref.current
    if (current.container !== container || current.token !== token || current.recursive !== recursive) {
        ref.current = { container, token, recursive, value: container.resolve(token, recursive) }
    }

    return ref.current.value
}

export function useResolveSafe<T>(token: InjectionToken<T>, recursive = true): T | undefined {
    const container = useContainer()
    const ref = useLazyRef<ResolveSnapshot<T | undefined>>(() => ({
        container,
        token,
        recursive,
        value: container.resolveSafe(token, recursive),
    }))

    const current = ref.current
    if (current.container !== container || current.token !== token || current.recursive !== recursive) {
        ref.current = { container, token, recursive, value: container.resolveSafe(token, recursive) }
    }

    return ref.current.value
}
