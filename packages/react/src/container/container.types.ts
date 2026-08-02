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
 * `singleton` - one instance per container that declares it. The only scope that can carry lifecycle:
 *               one instance, one death point.
 *
 * `transient` - a fresh instance per resolve. Never carries lifecycle.
 *
 * `request`   - one instance per resolution graph: shared by everything reached from a single
 *               `resolve`/`resolveAll`, fresh for the next one. Never carries lifecycle.
 */
export const Scope = Enum({
    Singleton: "singleton",
    Transient: "transient",
    Request: "request",
})
export type Scope = Enum<typeof Scope>

// Read modes
// ========================================

/**
 * How far a SINGLE read (`container.resolve`) looks for its one binding.
 *
 * `self`    - this container's own bindings only; an inherited registration is a miss.
 *
 * `nearest` - the substrate's own walk: the first binding at or above this container.
 *
 * There is no `chained` here: a single read produces one value, and one value cannot be accumulated.
 */
export const ResolveMode = Enum({
    Self: "self",
    Nearest: "nearest",
})
export type ResolveMode = Enum<typeof ResolveMode>

/**
 * How far a COLLECTION read (`container.resolveAll`) reaches.
 *
 * `self`    - this container's own bindings only; `[]` when it declares none.
 *
 * `nearest` - the substrate's own walk: the first binding at or above this container.
 *             That ancestor's bindings ALONE, never the chain above it.
 *
 * `chained` - every level accumulated, nearest first.
 */
export const ResolveAllMode = Enum({
    Self: "self",
    Nearest: "nearest",
    Chained: "chained",
})
export type ResolveAllMode = Enum<typeof ResolveAllMode>

/**
 * How far a REGISTRATION question (`container.isRegistered`) looks.
 *
 * `self`    - this container's own bindings only; an inherited registration is a miss.
 *
 * `nearest` - the substrate's own walk: the first binding at or above this container.
 */
export const RegistrationMode = Enum({
    Self: "self",
    Nearest: "nearest",
})
export type RegistrationMode = Enum<typeof RegistrationMode>

// Providers
// ========================================

/** Chain-wide provider registration mode. Has to agree on one mode across a chain, or registration throws. */
export type ProviderRegistrationMode = "single" | "multi"

/** The four implementation keys and what each one is built from. */
type ProviderUse<T = unknown> = {
    useClass: Constructor<T>
    useFactory: (...args: any[]) => T
    useExisting: InjectionToken<T>
    useValue: T
}

// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
type ProviderUseOnly<T, UseKey extends keyof ProviderUse<T>> = Pick<ProviderUse<T>, UseKey> & {
    [OtherKey in Exclude<keyof ProviderUse<T>, UseKey>]?: never
}

export const PROVIDER_USE_KEYS = [
    "useClass",
    "useFactory",
    "useExisting",
    "useValue",
] as const satisfies readonly (keyof ProviderUse)[]

export type OptionalFactoryDependency<T = unknown> = {
    token: InjectionToken<T>
    optional?: boolean
    mode?: ResolveMode

    multi?: false
}

export type MultiFactoryDependency<T = unknown> = {
    token: InjectionToken<T>
    multi: true
    mode?: ResolveAllMode

    optional?: never
}

export type FactoryDependency =
    | InjectionToken<any>
    | OptionalFactoryDependency<any>
    | MultiFactoryDependency<any>

/** An explicit token-based class provider, and the only class spelling that may join a collection. */
export interface TokenClassProvider<T = any> extends ProviderUseOnly<T, "useClass"> {
    provide: InjectionToken<T>
    scope?: Scope
    /** Skip construction during the owner's eager pass; build on first resolve instead. */
    lazy?: boolean
    /** Contribute to a collection under `provide` rather than claiming it; read it with `resolveAll`. */
    multi?: boolean

    inject?: never
}

/** The shorthand: registers under the class itself, with the options the bare constructor cannot take. */
export interface SelfClassProvider<T = any> extends ProviderUseOnly<T, "useClass"> {
    provide?: never
    scope?: Scope
    /** Skip construction during the owner's eager pass; build on first resolve instead. */
    lazy?: boolean

    multi?: false
    inject?: never
}

/** Both spellings under one name, so neither the shorthand nor `multi` widened the public surface. */
export type ClassProvider<T = any> = TokenClassProvider<T> | SelfClassProvider<T>

export interface ValueProvider<T = any> extends ProviderUseOnly<T, "useValue"> {
    provide: InjectionToken<T>
    /** Contribute to a collection under `provide` rather than claiming it; read it with `resolveAll`. */
    multi?: boolean

    lazy?: never
    inject?: never
}

export interface FactoryProvider<T = any> extends ProviderUseOnly<T, "useFactory"> {
    provide: InjectionToken<T>
    inject?: FactoryDependency[]
    scope?: Scope
    /** Skip construction during the owner's eager pass; build on first resolve instead. */
    lazy?: boolean
    /** Contribute to a collection under `provide` rather than claiming it; read it with `resolveAll`. */
    multi?: boolean
}

export interface ExistingProvider<T = any> extends ProviderUseOnly<T, "useExisting"> {
    provide: InjectionToken<T>
    /** Contribute to a collection under `provide` rather than claiming it; read it with `resolveAll`. */
    multi?: boolean

    lazy?: never
    inject?: never
}

export type Provider<T = any> =
    | Constructor<T>
    | ClassProvider<T>
    | ValueProvider<T>
    | FactoryProvider<T>
    | ExistingProvider<T>
