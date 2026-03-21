import type { DependencyContainer, InjectionToken } from "../aliases/index.js"

export function tryResolve<T>(
    container: DependencyContainer,
    token: InjectionToken<T>,
    recursive = true
): T | undefined {
    return container.isRegistered(token, recursive) ? container.resolve(token) : undefined
}

export function resolveOr<T, TFallback>(
    container: DependencyContainer,
    token: InjectionToken<T>,
    fallback: TFallback,
    recursive?: boolean
): T | TFallback

export function resolveOr<T, TFallback>(
    container: DependencyContainer,
    token: InjectionToken<T>,
    fallback: () => TFallback,
    recursive?: boolean
): T | TFallback

export function resolveOr<T, TFallback>(
    container: DependencyContainer,
    token: InjectionToken<T>,
    fallback: TFallback | (() => TFallback),
    recursive = true
): T | TFallback {
    const resolved = tryResolve(container, token, recursive)
    if (resolved !== undefined) return resolved

    if (typeof fallback === "function") {
        const callback = fallback as () => TFallback
        return callback()
    }

    return fallback
}

export const di = {
    tryResolve,
    resolveOr,
}
