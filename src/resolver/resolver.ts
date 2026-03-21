import { type DependencyContainer, type InjectionToken } from "../aliases/index.js"
import { tryResolve } from "../utils/di.js"

export interface IResolver {
    resolve<T>(token: InjectionToken<T>): T
    tryResolve<T>(token: InjectionToken<T>): T | undefined
}

export class Resolver implements IResolver {
    constructor(private readonly container: DependencyContainer) {}

    resolve<T>(token: InjectionToken<T>): T {
        return this.container.resolve(token)
    }

    tryResolve<T>(token: InjectionToken<T>): T | undefined {
        return tryResolve(this.container, token, true)
    }
}
