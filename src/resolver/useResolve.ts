import React from "react"
import { type InjectionToken } from "../aliases/index.js"

import { useContainer } from "../module/useModuleContext.js"
import { tryResolve } from "../utils/di.js"

export function useResolve<T>(token: InjectionToken<T>): T {
    const container = useContainer()

    return React.useMemo(() => {
        return container.resolve(token)
    }, [container, token])
}

export function useTryResolve<T>(token: InjectionToken<T>): T | undefined {
    const container = useContainer()

    return React.useMemo(() => {
        return tryResolve(container, token, true)
    }, [container, token])
}
