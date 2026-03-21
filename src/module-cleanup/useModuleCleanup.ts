import React from "react"
import { type DependencyContainer } from "../aliases/index.js"

import type { CleanupFn, CleanupOptions } from "./types.js"
import { CleanupRegistry } from "./cleanup-registry.js"
import { useEvent } from "../internals/hooks/useEvent.js"

export function useModuleCleanup(
    container: DependencyContainer,
    cleanup: CleanupFn,
    options?: CleanupOptions
): void {
    const eventCleanup = useEvent(cleanup)
    const mode = options?.mode

    React.useEffect(() => {
        return container.resolve(CleanupRegistry).add(eventCleanup, mode ? { mode } : undefined)
    }, [container, eventCleanup, mode])
}
