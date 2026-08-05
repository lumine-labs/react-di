/* eslint-disable @typescript-eslint/consistent-type-definitions */

import type { Constructor, InjectionToken, Scope } from "./container.types.js"

// Providers
// ========================================

/** Chain-wide provider registration mode. Has to agree on one mode across a chain, or registration throws. */
export type ProviderRegistrationMode = "single" | "multi"

export type EntryMetadata = Readonly<Record<string, unknown>>

export type ProviderUse<T = unknown> = {
    useClass: Constructor<T>
    useFactory: () => T
    useExisting: InjectionToken<T>
    useValue: T
}

// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
type ProviderUseOnly<T, UseKey extends keyof ProviderUse<T>> = Pick<ProviderUse<T>, UseKey> & {
    [OtherKey in Exclude<keyof ProviderUse<T>, UseKey>]?: never
}

/** An explicit token-based class provider, and the only class spelling that may join a collection. */
export interface TokenClassProvider<T = any> extends ProviderUseOnly<T, "useClass"> {
    provide: InjectionToken<T>
    scope?: Scope
    /** Contribute to a collection under `provide` rather than claiming it; read it with `resolveAll`. */
    multi?: boolean
    /** Carried through to the entry's snapshot untouched; the container never reads it. */
    metadata?: EntryMetadata
}

/** The shorthand: registers under the class itself, with the options the bare constructor cannot take. */
export interface SelfClassProvider<T = any> extends ProviderUseOnly<T, "useClass"> {
    provide?: never
    scope?: Scope

    multi?: false
    /** Carried through to the entry's snapshot untouched; the container never reads it. */
    metadata?: EntryMetadata
}

export type ClassProvider<T = any> = TokenClassProvider<T> | SelfClassProvider<T>

export interface ValueProvider<T = any> extends ProviderUseOnly<T, "useValue"> {
    provide: InjectionToken<T>
    /** Contribute to a collection under `provide` rather than claiming it; read it with `resolveAll`. */
    multi?: boolean
    /** Carried through to the entry's snapshot untouched; the container never reads it. */
    metadata?: EntryMetadata
}

export interface FactoryProvider<T = any> extends ProviderUseOnly<T, "useFactory"> {
    provide: InjectionToken<T>
    scope?: Scope
    /** Contribute to a collection under `provide` rather than claiming it; read it with `resolveAll`. */
    multi?: boolean
    /** Carried through to the entry's snapshot untouched; the container never reads it. */
    metadata?: EntryMetadata
}

export interface ExistingProvider<T = any> extends ProviderUseOnly<T, "useExisting"> {
    provide: InjectionToken<T>
    /** Contribute to a collection under `provide` rather than claiming it; read it with `resolveAll`. */
    multi?: boolean
    /** Carried through to the entry's snapshot untouched; the container never reads it. */
    metadata?: EntryMetadata
}

export type Provider<T = any> =
    | Constructor<T>
    | ClassProvider<T>
    | ValueProvider<T>
    | FactoryProvider<T>
    | ExistingProvider<T>
