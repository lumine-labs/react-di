/* eslint-disable @typescript-eslint/consistent-type-definitions */

import type {
    Constructor,
    InjectionToken,
    ResolveAllMode,
    ResolveMode,
    Scope,
} from "@remodulo/container/types"

// Factory dependencies
// ========================================

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

export type FactoryDependency = InjectionToken<any> | OptionalFactoryDependency<any> | MultiFactoryDependency<any>

// Providers
// ========================================

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
