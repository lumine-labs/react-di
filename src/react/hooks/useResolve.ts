import { useLazyRef } from "@lumelabs/react-toolkit"
import { type DependencyContainer, type InjectionToken } from "../../aliases/index.js"

import { useContainer } from "./useModuleContext.js"
import { resolve, tryResolve } from "../../shared/container-utils.js"

// Types
// ========================================

// One combined snapshot object so inputs and value can never desync: on any input change the WHOLE
// snapshot is replaced (never individual fields).
type ResolveSnapshot<T> = {
    container: DependencyContainer
    token: InjectionToken<T>
    recursive: boolean
    value: T
}

// Hooks
// ========================================

// Snapshot-ref resolution (not useMemo): useMemo is a performance hint, not a cache guarantee — React
// may drop it and re-resolve, minting a fresh instance mid-life for transient-scoped providers. The
// lazy ref guarantees identity: re-resolution happens ONLY when container/token/recursive change
// (a module rebuild swaps the context container, so rebuilds re-resolve automatically).
//
// Resolution runs during render — constructors must be pure; side effects belong in
// `onModuleInit`/`onModuleMount`.
export function useResolve<T>(token: InjectionToken<T>, recursive = true): T {
    const container = useContainer()
    const ref = useLazyRef<ResolveSnapshot<T>>(() => ({
        container,
        token,
        recursive,
        value: resolve(container, token, recursive),
    }))

    const current = ref.current
    if (current.container !== container || current.token !== token || current.recursive !== recursive) {
        ref.current = { container, token, recursive, value: resolve(container, token, recursive) }
    }

    return ref.current.value
}

// Same snapshot semantics: a memoized `undefined` (unregistered token) stays until an input changes.
export function useTryResolve<T>(token: InjectionToken<T>, recursive = true): T | undefined {
    const container = useContainer()
    const ref = useLazyRef<ResolveSnapshot<T | undefined>>(() => ({
        container,
        token,
        recursive,
        value: tryResolve(container, token, recursive),
    }))

    const current = ref.current
    if (current.container !== container || current.token !== token || current.recursive !== recursive) {
        ref.current = { container, token, recursive, value: tryResolve(container, token, recursive) }
    }

    return ref.current.value
}
