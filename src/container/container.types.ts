/* eslint-disable @typescript-eslint/consistent-type-definitions */

import { Enum } from "@luminelabs/toolkit"

// Tokens
// ========================================

export type Constructor<T = unknown> = new (...args: any[]) => T
export type AbstractConstructor<T = unknown> = abstract new (...args: any[]) => T
export type InjectionToken<T = unknown> = string | symbol | Constructor<T> | AbstractConstructor<T>

// Scope
// ========================================

/**
 * Two scopes, and the strings are the whole representation — there is no separate enum to normalize
 * against, which is why the old `normalizeProviderScope` has no counterpart here.
 *
 * `singleton` - one instance per container that declares it. The only scope that can carry lifecycle:
 *               one instance, one death point.
 * `transient` - a fresh instance per resolve. Never carries lifecycle.
 */
export const Scope = Enum({
    Singleton: "singleton",
    Transient: "transient",
})
export type Scope = Enum<typeof Scope>

// Providers
// ========================================

/**
 * The four implementation keys and what each one is built from - the matrix every provider form is a row
 * of. Declared once so a new form cannot quietly disagree about what `useFactory` means.
 */
type Use<T = unknown> = {
    useClass: Constructor<T>
    useFactory: (...args: any[]) => T
    useExisting: InjectionToken<T>
    useValue: T
}

export const USE_KEYS = ["useClass", "useFactory", "useExisting", "useValue"] as const satisfies readonly (keyof Use)[]

// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
type UseOnly<T, UseKey extends keyof Use<T>> = Pick<Use<T>, UseKey> & {
    [OtherKey in Exclude<keyof Use<T>, UseKey>]?: never
}

export type OptionalFactoryDependency<T = unknown> = {
    token: InjectionToken<T>
    optional: true
}

export type FactoryDependency = InjectionToken<any> | OptionalFactoryDependency<any>

export interface ClassProvider<T = any> extends UseOnly<T, "useClass"> {
    /** Optional alone among the forms: a class is its own token, so leaving it out registers it as itself. */
    provide?: InjectionToken<T>
    scope?: Scope
    /** Skip construction during the owner's eager pass; build on first resolve instead. */
    lazy?: boolean
    inject?: never
}

export interface ValueProvider<T = any> extends UseOnly<T, "useValue"> {
    provide: InjectionToken<T>
    /** Already an instance — there is nothing to defer. */
    lazy?: never
    inject?: never
}

export interface FactoryProvider<T = any> extends UseOnly<T, "useFactory"> {
    provide: InjectionToken<T>
    inject?: FactoryDependency[]
    scope?: Scope
    lazy?: boolean
}

export interface ExistingProvider<T = any> extends UseOnly<T, "useExisting"> {
    provide: InjectionToken<T>
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
