import { useLazyRef } from "@luminelabs/react-toolkit"

import type { Container, InjectionToken } from "../../container/index.js"
import { useContainer } from "./useModuleContext.js"

// Types
// ========================================

type ResolveAllSnapshot<T> = {
    container: Container
    token: InjectionToken<T>
    value: T[]
}

// Hooks
// ========================================

export function useResolveAll<T>(token: InjectionToken<T>): T[] {
    const container = useContainer()
    const ref = useLazyRef<ResolveAllSnapshot<T>>(() => ({
        container,
        token,
        value: container.resolveAll(token),
    }))

    const current = ref.current
    if (current.container !== container || current.token !== token) {
        ref.current = { container, token, value: container.resolveAll(token) }
    }

    return ref.current.value
}
