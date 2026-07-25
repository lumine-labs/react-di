import type { DependencyContainer, InjectionToken } from "../aliases/index.js"
import { ModuleMetadata } from "./providers/module-metadata/module-metadata.provider.js"
import { describeToken } from "../shared/describeToken.js"
import { isDevelopment } from "../shared/isDevelopment.js"

export function resolve<T>(container: DependencyContainer, token: InjectionToken<T>, recursive = true): T {
    if (!container.isRegistered(token, recursive)) {
        throw new Error(notRegisteredMessage(container, token, recursive))
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
    fallback: () => F,
    recursive?: boolean
): T | F
export function resolveOr<T, F>(
    container: DependencyContainer,
    token: InjectionToken<T>,
    fallback: F,
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

// Error messages
// ========================================

function notRegisteredMessage(container: DependencyContainer, token: InjectionToken<any>, recursive: boolean): string {
    const description = describeToken(token)

    if (isDevelopment()) {
        const moduleId = tryModuleId(container)

        if (moduleId === undefined) {
            return recursive
                ? `Token ${description} is not registered in this container or any ancestor.`
                : `Token ${description} is not registered in this container (searched that container only).`
        }

        return recursive
            ? `Token ${description} is not registered in module "${moduleId}" or any ancestor.`
            : `Token ${description} is not registered in module "${moduleId}" (searched that module only).`
    }

    return `Token ${description} is not registered.`
}

function tryModuleId(container: DependencyContainer): string | undefined {
    try {
        return tryResolve(container, ModuleMetadata)?.id
    } catch {
        return undefined
    }
}
