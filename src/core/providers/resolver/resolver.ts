import type { DependencyContainer, InjectionToken } from "../../../aliases/index.js"
import { resolve, tryResolve } from "../../../shared/container-utils.js"

export class Resolver {
    constructor(private readonly container: DependencyContainer) {}

    resolve<T>(token: InjectionToken<T>, recursive = true): T {
        return resolve(this.container, token, recursive)
    }

    tryResolve<T>(token: InjectionToken<T>, recursive = true): T | undefined {
        return tryResolve(this.container, token, recursive)
    }
}
