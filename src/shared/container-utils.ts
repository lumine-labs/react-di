import type { DependencyContainer, InjectionToken } from "../aliases/index.js"

export function resolve<T>(container: DependencyContainer, token: InjectionToken<T>, recursive = true): T {
    if (!container.isRegistered(token, recursive)) {
        throw new Error(`Token is not registered${recursive ? "" : " in current module container"}.`)
    }
    return container.resolve(token)
}

export function tryResolve<T>(
    container: DependencyContainer,
    token: InjectionToken<T>,
    recursive = true
): T | undefined {
    return container.isRegistered(token, recursive) ? container.resolve(token) : undefined
}

export function resolveAll<T>(container: DependencyContainer, token: InjectionToken<T>, recursive = true): T[] {
    return container.isRegistered(token, recursive) ? container.resolveAll(token) : []
}

export function resolveOr<T, F>(
    container: DependencyContainer,
    token: InjectionToken<T>,
    fallback: F,
    recursive?: boolean
): T | F

export function resolveOr<T, F>(
    container: DependencyContainer,
    token: InjectionToken<T>,
    fallback: () => F,
    recursive?: boolean
): T | F

export function resolveOr<T, F>(
    container: DependencyContainer,
    token: InjectionToken<T>,
    fallback: F | (() => F),
    recursive = true
): T | F {
    if (container.isRegistered(token, recursive)) {
        return container.resolve(token)
    }

    if (typeof fallback === "function") {
        const callback = fallback as () => F
        return callback()
    }

    return fallback
}
