import type { Container, InjectionToken } from "../../../container"

export class Resolver {
    constructor(private readonly container: Container) {}

    resolve<T>(token: InjectionToken<T>, recursive = true): T {
        return this.container.resolve(token, recursive)
    }

    resolveSafe<T>(token: InjectionToken<T>, recursive = true): T | undefined {
        return this.container.resolveSafe(token, recursive)
    }

    resolveOr<T, F>(token: InjectionToken<T>, fallback: () => F, recursive?: boolean): T | F
    resolveOr<T, F>(token: InjectionToken<T>, fallback: F, recursive?: boolean): T | F
    resolveOr<T, F>(token: InjectionToken<T>, fallback: F | (() => F), recursive = true): T | F {
        return this.container.resolveOr(token, fallback as F, recursive)
    }

    resolveAll<T>(token: InjectionToken<T>): T[] {
        return this.container.resolveAll(token)
    }

    isRegistered(token: InjectionToken<unknown>, recursive = true): boolean {
        return this.container.isRegistered(token, recursive)
    }
}
