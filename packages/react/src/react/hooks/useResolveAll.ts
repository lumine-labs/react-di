import { useLazyRef } from "@luminelabs/react-toolkit"

import type { Container, InjectionToken, ResolveAllMode } from "@remodulo/container"
import { useContainer } from "./useModuleContext.js"

// Types
// ========================================

type ResolveAllSnapshot<T> = {
    container: Container
    token: InjectionToken<T>
    mode: ResolveAllMode
    value: T[]
}

// Hooks
// ========================================

export function useResolveAll<T>(token: InjectionToken<T>, mode: ResolveAllMode = "chained"): T[] {
    const container = useContainer()
    const ref = useLazyRef<ResolveAllSnapshot<T>>(() => ({
        container,
        token,
        mode,
        value: container.resolveAll(token, mode),
    }))

    const current = ref.current
    if (current.container !== container || current.token !== token || current.mode !== mode) {
        ref.current = { container, token, mode, value: container.resolveAll(token, mode) }
    }

    return ref.current.value
}
