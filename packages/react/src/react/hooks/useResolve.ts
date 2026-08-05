import { useLazyRef } from "@luminelabs/react-toolkit"

import type { Container, InjectionToken, ResolveMode } from "@remodulo/container"
import { useContainer } from "./useModuleContext.js"

// Types
// ========================================

type ResolveSnapshot<T> = {
    container: Container
    token: InjectionToken<T>
    mode: ResolveMode
    value: T
}

// Hooks
// ========================================

export function useResolve<T>(token: InjectionToken<T>, mode: ResolveMode = "nearest"): T {
    const container = useContainer()
    const ref = useLazyRef<ResolveSnapshot<T>>(() => ({
        container,
        token,
        mode,
        value: container.resolve(token, mode),
    }))

    const current = ref.current
    if (current.container !== container || current.token !== token || current.mode !== mode) {
        ref.current = { container, token, mode, value: container.resolve(token, mode) }
    }

    return ref.current.value
}

export function useResolveOptional<T>(token: InjectionToken<T>, mode: ResolveMode = "nearest"): T | undefined {
    const container = useContainer()
    const ref = useLazyRef<ResolveSnapshot<T | undefined>>(() => ({
        container,
        token,
        mode,
        value: container.resolveOptional(token, mode),
    }))

    const current = ref.current
    if (current.container !== container || current.token !== token || current.mode !== mode) {
        ref.current = { container, token, mode, value: container.resolveOptional(token, mode) }
    }

    return ref.current.value
}
