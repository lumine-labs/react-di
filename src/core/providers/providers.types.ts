import { type InjectionToken, Scope } from "../../aliases/index.js"
import type { Constructor } from "../../shared/types.js"

export type ProviderScope = "singleton" | "transient" | "containerScoped" | "resolutionScoped" | Scope

export type OptionalFactoryDependency<T = unknown> = {
    token: InjectionToken<T>
    optional: true
}

export type FactoryDependency = InjectionToken<any> | OptionalFactoryDependency<any>

export interface ClassProvider<T = any> {
    provide: InjectionToken<T>
    useClass: Constructor<T>
    scope?: ProviderScope
    inject?: never
}

export interface ValueProvider<T = any> {
    provide: InjectionToken<T>
    useValue: T
    inject?: never
}

export interface FactoryProvider<T = any> {
    provide: InjectionToken<T>
    useFactory: (...args: any[]) => T
    inject?: FactoryDependency[]
    scope?: ProviderScope
}

export interface ExistingProvider<T = any> {
    provide: InjectionToken<T>
    useExisting: InjectionToken<T>
}

export type Provider<T = any> =
    | Constructor<T>
    | ClassProvider<T>
    | ValueProvider<T>
    | FactoryProvider<T>
    | ExistingProvider<T>
