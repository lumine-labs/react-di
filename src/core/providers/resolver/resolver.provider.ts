import type {
    Container,
    InjectionToken,
    RegistrationMode,
    ResolveAllMode,
    ResolveMode,
} from "../../../container/index.js"

/** Mirrors `Container`'s read surface exactly — same names, same mode parameters, same defaults. */
export class Resolver {
    constructor(private readonly container: Container) {}

    resolve<T>(token: InjectionToken<T>, mode: ResolveMode = "nearest"): T {
        return this.container.resolve(token, mode)
    }

    resolveOptional<T>(token: InjectionToken<T>, mode: ResolveMode = "nearest"): T | undefined {
        return this.container.resolveOptional(token, mode)
    }

    resolveOr<T, F>(token: InjectionToken<T>, fallback: () => F, mode?: ResolveMode): T | F
    resolveOr<T, F>(token: InjectionToken<T>, fallback: F, mode?: ResolveMode): T | F
    resolveOr<T, F>(token: InjectionToken<T>, fallback: F | (() => F), mode: ResolveMode = "nearest"): T | F {
        return this.container.resolveOr(token, fallback as F, mode)
    }

    resolveAll<T>(token: InjectionToken<T>, mode: ResolveAllMode = "chained"): T[] {
        return this.container.resolveAll(token, mode)
    }

    isRegistered(token: InjectionToken<unknown>, mode: RegistrationMode = "nearest"): boolean {
        return this.container.isRegistered(token, mode)
    }
}
