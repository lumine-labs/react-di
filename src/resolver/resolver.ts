import { type DependencyContainer, type InjectionToken } from "tsyringe"

export const TResolver = Symbol("Resolver")

export interface IResolver {
    resolve<T>(token: InjectionToken<T>): T

    // Recursive lookup through parent containers.
    tryResolve<T>(token: InjectionToken<T>): T | undefined

    // Current scope only. Throws if token is not in the current scope.
    resolveScoped<T>(token: InjectionToken<T>): T

    // Current scope only (no parent walk).
    tryResolveScoped<T>(token: InjectionToken<T>): T | undefined
}

export function makeResolver(container: DependencyContainer): IResolver {
    const tryResolveScoped = <T>(token: InjectionToken<T>): T | undefined => {
        return container.isRegistered(token, false) ? container.resolve<T>(token) : undefined
    }

    return {
        resolve: <T>(token: InjectionToken<T>) => container.resolve<T>(token),
        tryResolve: <T>(token: InjectionToken<T>) => (container.isRegistered(token, true) ? container.resolve<T>(token) : undefined),
        resolveScoped: <T>(token: InjectionToken<T>) => {
            const scoped = tryResolveScoped(token)
            if (scoped !== undefined) {
                return scoped
            }

            throw new Error(`Resolver.resolveScoped: token is not registered in current scope: "${String(token)}"`)
        },
        tryResolveScoped,
    }
}

export function registerResolver(container: DependencyContainer): void {
    if (container.isRegistered(TResolver, false)) {
        return
    }

    container.register<IResolver>(TResolver, {
        useFactory: (c) => makeResolver(c),
    })
}