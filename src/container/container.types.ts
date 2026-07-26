// Tokens
// ========================================

import { Enum } from "@luminelabs/toolkit"

export type Constructor<T = unknown> = new (...args: any[]) => T
export type AbstractConstructor<T = unknown> = abstract new (...args: any[]) => T

/**
 * Anything a provider can be registered under. Structurally identical to Inversify's
 * `ServiceIdentifier`, declared here so nothing outside this directory names an Inversify type.
 */
export type InjectionToken<T = unknown> = string | symbol | Constructor<T> | AbstractConstructor<T>

// Scope
// ========================================

/**
 * Two scopes, and the strings are the whole representation — there is no separate enum to normalize
 * against, which is why the old `normalizeProviderScope` has no counterpart here.
 *
 * `singleton` — one instance per container that declares it. The only scope that can carry lifecycle:
 *               one instance, one death point.
 * `transient` — a fresh instance per resolve. Never carries lifecycle, by construction: `register`
 *               attaches no activation hook to a transient binding, so there is no code path that
 *               could hand one to a lifecycle owner.
 */
export const Scope = Enum({
    Singleton: "singleton",
    Transient: "transient",
})
export type Scope = Enum<typeof Scope>

// Providers
// ========================================

export type OptionalFactoryDependency<T = unknown> = {
    token: InjectionToken<T>
    optional: true
}

export type FactoryDependency = InjectionToken<any> | OptionalFactoryDependency<any>

export type ClassProvider<T = any> = {
    provide: InjectionToken<T>
    useClass: Constructor<T>
    scope?: Scope
    /** Skip construction during the owner's eager pass; build on first resolve instead. */
    lazy?: boolean
    inject?: never
}

export type ValueProvider<T = any> = {
    provide: InjectionToken<T>
    useValue: T
    /** Already an instance — there is nothing to defer. */
    lazy?: never
    inject?: never
}

export type FactoryProvider<T = any> = {
    provide: InjectionToken<T>
    useFactory: (...args: any[]) => T
    inject?: FactoryDependency[]
    scope?: Scope
    lazy?: boolean
}

export type ExistingProvider<T = any> = {
    provide: InjectionToken<T>
    useExisting: InjectionToken<T>
    /** An alias constructs nothing; its target registers itself. */
    lazy?: never
    inject?: never
}

export type Provider<T = any> =
    | Constructor<T>
    | ClassProvider<T>
    | ValueProvider<T>
    | FactoryProvider<T>
    | ExistingProvider<T>

