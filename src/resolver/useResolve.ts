import React from "react"
import { type InjectionToken } from "tsyringe"
import { useContainer } from "../container/useContainer"

const UNREGISTERED_TOKEN_PREFIX = "Attempted to resolve unregistered dependency token:"

function isUnregisteredDependencyError(error: unknown): boolean {
    return error instanceof Error && error.message.startsWith(UNREGISTERED_TOKEN_PREFIX)
}

export function useResolve<T>(token: InjectionToken<T>): T {
    const container = useContainer()

    return React.useMemo(() => {
        return container.resolve(token)
    }, [container, token])
}

export function useTryResolve<T>(token: InjectionToken<T>): T | undefined {
    const container = useContainer()

    return React.useMemo(() => {
        try {
            return container.resolve(token)
        } catch (error) {
            if (isUnregisteredDependencyError(error)) {
                return undefined
            }
            throw error
        }
    }, [container, token])
}