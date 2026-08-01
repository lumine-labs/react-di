import { Container as InversifyContainer, type ServiceIdentifier } from "inversify"

import {
    Scope,
    type Constructor,
    type FactoryDependency,
    type InjectionToken,
    type MultiFactoryDependency,
    type OptionalFactoryDependency,
    type Provider,
    type ClassProvider,
    type ValueProvider,
    type FactoryProvider,
    type ExistingProvider,
    PROVIDER_USE_KEYS,
    type ProviderRegistrationMode,
    type RegistrationMode,
    type ResolveAllMode,
    type ResolveMode,
} from "./container.types.js"
import {
    aliasTargetsMulti,
    alreadyRegistered,
    invalidProvider,
    lazyMismatch,
    missingProvide,
    mixedImplementationKeys,
    modeConflict,
    multiNeedsProvide,
    multiRegistered,
    notObservable,
    notRegistered,
    singleRegistration,
} from "./container.errors.js"

// Types
// ========================================

type ActivatableBinding = { onActivation(handler: (context: any, instance: any) => any): unknown }
type BindingListener = (instance: unknown) => void
type ObservableBinding = { binding: ActivatableBinding; scope: Scope; listeners?: BindingListener[] }
type ObservedBinding = { scope: Scope }
type ScopedBinding = { inSingletonScope(): ActivatableBinding; inTransientScope(): ActivatableBinding }

// Container
// ========================================

export class Container {
    readonly #inversify: InversifyContainer
    readonly #parent: Container | null

    // Token -> its own bindings, in registration order. Aliases absent: they bind nothing of their own.
    readonly #bindings = new Map<InjectionToken<unknown>, ObservableBinding[]>()
    // Token -> mode, this container only. Chain-wide by construction, so the nearest entry answers.
    readonly #modes = new Map<InjectionToken<unknown>, ProviderRegistrationMode>()
    // Multi token -> the `lazy` its first constructing member declared. Value and alias members declare none.
    readonly #multiLazy = new Map<InjectionToken<unknown>, boolean>()
    // Alias target -> its aliases, so a token turning multi fails whichever order the two arrived in.
    readonly #aliasTargets = new Map<InjectionToken<unknown>, InjectionToken<unknown>[]>()

    constructor(parent?: Container) {
        this.#parent = parent ?? null
        this.#inversify = parent
            ? new InversifyContainer({ parent: parent.#inversify, jitless: true })
            : new InversifyContainer({ jitless: true })
    }

    fork(): Container {
        return new Container(this)
    }

    // Registration
    // ========================================

    register(provider: Provider | Provider[]): void {
        if (Array.isArray(provider)) {
            for (const p of provider) this.register(p)
            return
        }

        // If provider is a class, bind it as self-scoped singleton
        if (typeof provider === "function") {
            this.#claim(provider, false)
            this.#bindClass(provider, provider, Scope.Singleton)
            return
        }

        if (provider === null || typeof provider !== "object") {
            throw new Error(invalidProvider(provider))
        }

        // Two distinct failures, two messages: nothing recognisable differs from naming two
        // implementations, and only the second can name the keys.
        const presentUseKeys = PROVIDER_USE_KEYS.filter((key) => key in provider)
        if (presentUseKeys.length > 1) throw new Error(mixedImplementationKeys(provider, presentUseKeys))
        if (presentUseKeys.length === 0) throw new Error(invalidProvider(provider))
        const [useKey] = presentUseKeys

        const multi = provider.multi === true

        switch (useKey) {
            case "useClass": {
                const p = provider as ClassProvider

                if (typeof p.useClass !== "function") {
                    throw new Error(invalidProvider(provider))
                }

                if (multi && p.provide === undefined) {
                    throw new Error(multiNeedsProvide())
                }

                const token = p.provide ?? p.useClass
                const scope = p.scope ?? Scope.Singleton

                this.#claim(token, multi)
                if (multi) this.#claimMultiLazy(token, p.lazy === true)

                this.#bindClass(token, p.useClass, scope)
                return
            }

            case "useFactory": {
                const p = provider as FactoryProvider

                if (typeof p.useFactory !== "function") {
                    throw new Error(invalidProvider(provider))
                }

                this.#assertProvide(p.provide, useKey)
                const scope = p.scope ?? Scope.Singleton

                this.#claim(p.provide, multi)
                if (multi) this.#claimMultiLazy(p.provide, p.lazy === true)

                const factory = p.useFactory
                const dependencies = p.inject

                const binding = this.#inversify
                    .bind(id(p.provide))
                    .toDynamicValue(() => factory(...this.#resolveDependencies(dependencies)))
                this.#recordBinding(p.provide, this.#scoped(binding, scope), scope)

                return
            }

            case "useValue": {
                const p = provider as ValueProvider

                this.#assertProvide(p.provide, useKey)
                this.#claim(p.provide, multi)

                // A constant is retained by definition, whatever else shares its token.
                this.#recordBinding(
                    p.provide,
                    this.#inversify.bind(id(p.provide)).toConstantValue(p.useValue),
                    Scope.Singleton
                )
                return
            }

            case "useExisting": {
                const p = provider as ExistingProvider

                if (p.useExisting === undefined) {
                    throw new Error(invalidProvider(provider))
                }

                this.#assertProvide(p.provide, useKey)

                // An alias may BE a collection member, never TARGET one: `toService` is a single-value
                // read, which is what the mode guards refuse.
                if (this.#modeOf(p.useExisting) === "multi") {
                    throw new Error(aliasTargetsMulti(p.provide, p.useExisting))
                }

                this.#claim(p.provide, multi)
                this.#inversify.bind(id(p.provide)).toService(id(p.useExisting))
                this.#rememberAlias(p.useExisting, p.provide)
                return
            }
            default:
                throw new Error(invalidProvider(provider))
        }
    }

    isRegistered(token: InjectionToken<unknown>, mode: RegistrationMode = "nearest"): boolean {
        const tokenId = id(token)
        return mode === "self" ? this.#inversify.isCurrentBound(tokenId) : this.#inversify.isBound(tokenId)
    }

    /**
     * Route each `inject` entry to the read it names. Routing only: every mode default and every error —
     * mode-mixing, not-registered, ambiguity — belongs to the read being called, so a factory dependency
     * behaves exactly as the same call written by hand would.
     */
    #resolveDependencies(dependencies?: FactoryDependency[]): unknown[] {
        if (!dependencies?.length) return []

        return dependencies.map((dependency) => {
            // The shorthand: one value, nearest, required.
            if (!isDependencyOptions(dependency)) return this.resolve(dependency)

            // `mode` is passed through undefined and all: the read owns its default.
            if (dependency.multi === true) return this.resolveAll(dependency.token, dependency.mode)

            return dependency.optional === true
                ? this.resolveOptional(dependency.token, dependency.mode)
                : this.resolve(dependency.token, dependency.mode)
        })
    }

    #bindClass(token: InjectionToken<unknown>, implementation: Constructor<unknown>, scope: Scope): void {
        const binding =
            token === implementation
                ? this.#inversify.bind(id(token)).toSelf()
                : this.#inversify.bind(id(token)).to(implementation)

        this.#recordBinding(token, this.#scoped(binding, scope), scope)
    }

    #scoped(binding: ScopedBinding, scope: Scope): ActivatableBinding {
        return scope === Scope.Transient ? binding.inTransientScope() : binding.inSingletonScope()
    }

    // Observation
    // ========================================

    /** Observe every instance this container builds for the token. One call per member of a collection. */
    onResolution<T>(token: InjectionToken<T>, listener: (instance: T) => void): void {
        this.onPredicateResolution(token, listener, () => true)
    }

    /**
     * @internal Adoption plumbing. Consumers get one observation concept, `onResolution`.
     *
     * `accepts` decides per binding, once, at attach time — and sees only the binding's scope, never the
     * binding. Matching nothing is legitimate; an unregistered token still throws.
     */
    onPredicateResolution<T>(
        token: InjectionToken<T>,
        listener: (instance: T) => void,
        accepts: (entry: ObservedBinding) => boolean
    ): void {
        const bindings = this.#bindings.get(token)
        if (!bindings || bindings.length === 0) throw new Error(notObservable(token))

        // Per binding, not per container: a container-level listener is inherited downward and matched by
        // token, so a descendant shadowing this token would report its instance here too.
        for (const entry of bindings) {
            if (accepts({ scope: entry.scope })) this.#listen(entry, listener as BindingListener)
        }
    }

    /** Join a binding's listener list, installing the one inversify handler that dispatches to it if needed. */
    #listen(entry: ObservableBinding, listener: BindingListener): void {
        if (entry.listeners) {
            entry.listeners.push(listener)
            return
        }

        const listeners: BindingListener[] = [listener]
        entry.listeners = listeners

        entry.binding.onActivation((_context: unknown, instance: unknown) => {
            // Snapshot: a listener attached mid-notification joins for the next construction, not this walk.
            for (const notify of [...listeners]) notify(instance)

            return instance // never a listener's return value
        })
    }

    // Resolution
    // ========================================

    resolve<T>(token: InjectionToken<T>, mode: ResolveMode = "nearest"): T {
        this.#assertSingleValued(token)

        if (!this.isRegistered(token, mode)) {
            throw new Error(notRegistered(token, mode))
        }
        return this.#inversify.get(id(token))
    }

    resolveOptional<T>(token: InjectionToken<T>, mode: ResolveMode = "nearest"): T | undefined {
        this.#assertSingleValued(token)

        if (!this.isRegistered(token, mode)) return undefined
        return this.#inversify.get(id(token))
    }

    resolveOr<T, F>(token: InjectionToken<T>, fallback: () => F, mode?: ResolveMode): T | F
    resolveOr<T, F>(token: InjectionToken<T>, fallback: F, mode?: ResolveMode): T | F
    resolveOr<T, F>(token: InjectionToken<T>, fallback: F | (() => F), mode: ResolveMode = "nearest"): T | F {
        this.#assertSingleValued(token)

        if (this.isRegistered(token, mode)) {
            return this.#inversify.get(id(token))
        }

        if (typeof fallback === "function") {
            return (fallback as () => F)()
        }

        return fallback
    }

    resolveAll<T>(token: InjectionToken<T>, mode: ResolveAllMode = "chained"): T[] {
        if (this.#modeOf(token) === "single") {
            throw new Error(singleRegistration(token))
        }

        if (mode === "self" && !this.isRegistered(token, "self")) return []
        return this.#inversify.getAll(id(token), { chained: mode === "chained" })
    }

    // Claim
    // ========================================

    /** Settle a registration's mode against everything already registered for the token. */
    #claim(token: InjectionToken<unknown>, multi: boolean): void {
        const mode: ProviderRegistrationMode = multi ? "multi" : "single"
        const own = this.#modes.get(token)

        if (own === "single" && mode === "single") throw new Error(alreadyRegistered(token))
        if (own !== undefined && own !== mode) throw new Error(modeConflict(token, own, mode, false))

        // Only the first own registration consults the chain; later ones are already reconciled with it.
        if (own === undefined) {
            const inherited = this.#parent === null ? undefined : this.#parent.#modeOf(token)
            if (inherited !== undefined && inherited !== mode) {
                throw new Error(modeConflict(token, inherited, mode, true))
            }
        }

        if (mode === "multi") {
            const alias = this.#aliasOf(token)
            if (alias !== undefined) {
                throw new Error(aliasTargetsMulti(alias, token))
            }
        }

        this.#modes.set(token, mode)
    }

    /** Settle a collection's laziness against everything already registered for the token. */
    #claimMultiLazy(token: InjectionToken<unknown>, lazy: boolean): void {
        const declared = this.#multiLazy.get(token)
        if (declared !== undefined && declared !== lazy) {
            throw new Error(lazyMismatch(token, declared, lazy))
        }
        this.#multiLazy.set(token, lazy)
    }

    // Indexes
    // ========================================

    #rememberAlias(target: InjectionToken<unknown>, alias: InjectionToken<unknown>): void {
        const aliases = this.#aliasTargets.get(target)
        if (aliases) aliases.push(alias)
        else this.#aliasTargets.set(target, [alias])
    }

    /** Registration order is the order a collection resolves in. */
    #recordBinding(token: InjectionToken<unknown>, binding: ActivatableBinding, scope: Scope): void {
        const entry: ObservableBinding = { binding, scope }
        const bindings = this.#bindings.get(token)
        if (bindings) bindings.push(entry)
        else this.#bindings.set(token, [entry])
    }

    /** Nearest declared mode at or above this container, or undefined when nothing declares the token. */
    #modeOf(token: InjectionToken<unknown>): ProviderRegistrationMode | undefined {
        let current: Container | null = this
        while (current) {
            const mode = current.#modes.get(token)
            if (mode !== undefined) return mode
            current = current.#parent
        }
        return undefined
    }

    /** Nearest token aliasing `target` at or above this container, if any. */
    #aliasOf(target: InjectionToken<unknown>): InjectionToken<unknown> | undefined {
        let current: Container | null = this
        while (current) {
            const aliases = current.#aliasTargets.get(target)
            if (aliases !== undefined && aliases.length > 0) return aliases[0]
            current = current.#parent
        }
        return undefined
    }

    // Validators
    // ========================================

    #assertProvide(token: InjectionToken<unknown> | undefined, useKey: string): void {
        if (token === undefined) throw new Error(missingProvide(useKey))
    }

    #assertSingleValued(token: InjectionToken<unknown>): void {
        if (this.#modeOf(token) === "multi") {
            throw new Error(multiRegistered(token))
        }
    }
}

// Helpers
// ========================================

function id<T>(token: InjectionToken<T>): ServiceIdentifier<T> {
    return token
}

/** Object form or bare token: no `InjectionToken` is `typeof "object"`, so the check is the whole test. */
function isDependencyOptions(
    dependency: FactoryDependency
): dependency is MultiFactoryDependency<any> | OptionalFactoryDependency<any> {
    return typeof dependency === "object" && dependency !== null
}
