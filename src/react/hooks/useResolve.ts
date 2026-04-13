import React from "react"
import { type InjectionToken } from "../../aliases/index.js"

import { useContainer } from "./useModuleContext.js"
import { resolve, tryResolve } from "../../shared/container-utils.js"

export function useResolve<T>(token: InjectionToken<T>, recursive = true): T {
    const container = useContainer()

    return React.useMemo(() => {
        return resolve(container, token, recursive)
    }, [container, token, recursive])
}

export function useTryResolve<T>(token: InjectionToken<T>, recursive = true): T | undefined {
    const container = useContainer()

    return React.useMemo(() => {
        return tryResolve(container, token, recursive)
    }, [container, token, recursive])
}
