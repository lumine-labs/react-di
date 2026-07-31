import { Container as InversifyContainer, type ServiceIdentifier } from "inversify"

import {
    Scope,
    type Constructor,
    type FactoryDependency,
    type InjectionToken,
    type OptionalFactoryDependency,
    type Provider,
    type ClassProvider,
    type ValueProvider,
    type FactoryProvider,
    type ExistingProvider,
    USE_KEYS,
} from "./container.types.js"
import { describeToken } from "../shared/describeToken.js"

// Container
// ========================================

export class Container {
    readonly #inversify: InversifyContainer

    // Token -> its own binding. Aliases are absent: resolving one fires only the target's listener.
    readonly #bindings = new Map<InjectionToken<unknown>, ActivatableBinding>()

    constructor(parent?: Container) {
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
            this.#assertFree(provider)
            this.#bindClass(provider, provider, Scope.Singleton)
            return
        }

        // Check illegal provider forms
        if (provider === null || typeof provider !== "object") {
            throw new Error(invalidProvider(provider))
        }

        // Exactly one implementation key. Two distinct failures, two distinct messages: nothing recognisable
        // is a different mistake from naming two implementations, and only the second can name the keys.
        const presentUseKeys = USE_KEYS.filter((key) => key in provider)
        if (presentUseKeys.length > 1) {
            throw new Error(mixedImplementationKeys(provider, presentUseKeys))
        }
        if (presentUseKeys.length === 0) {
            throw new Error(invalidProvider(provider))
        }
        const [useKey] = presentUseKeys

        switch (useKey) {
            case "useClass": {
                const p = provider as ClassProvider

                if (typeof p.useClass !== "function") {
                    throw new Error(invalidProvider(provider))
                }

                const token = p.provide ?? p.useClass
                this.#assertFree(token)
                this.#bindClass(token, p.useClass, p.scope ?? Scope.Singleton)
                return
            }
            case "useFactory": {
                const p = provider as FactoryProvider

                if (typeof p.useFactory !== "function") {
                    throw new Error(invalidProvider(provider))
                }

                this.#assertProvide(p.provide, useKey)
                this.#assertFree(p.provide)

                const factory = p.useFactory
                const dependencies = p.inject

                const binding = this.#inversify
                    .bind(this.#id(p.provide))
                    .toDynamicValue(() => factory(...this.#resolveDependencies(dependencies)))
                const activatable = this.#scoped(binding, p.scope ?? Scope.Singleton)
                this.#bindings.set(p.provide, activatable)

                return
            }
            case "useValue": {
                const p = provider as ValueProvider

                this.#assertProvide(p.provide, useKey)
                this.#assertFree(p.provide)

                const binding = this.#inversify.bind(this.#id(p.provide)).toConstantValue(p.useValue)
                this.#bindings.set(p.provide, binding)
                return
            }
            case "useExisting": {
                const p = provider as ExistingProvider

                if (p.useExisting === undefined) {
                    throw new Error(invalidProvider(provider))
                }

                this.#assertProvide(p.provide, useKey)
                this.#assertFree(p.provide)
                this.#inversify.bind(this.#id(p.provide)).toService(this.#id(p.useExisting))
                return
            }
            default:
                throw new Error(invalidProvider(provider))
        }
    }

    isRegistered(token: InjectionToken<unknown>, recursive = true): boolean {
        const id = this.#id(token)
        return recursive ? this.#inversify.isBound(id) : this.#inversify.isCurrentBound(id)
    }

    // Observation
    // ========================================

    onResolution<T>(token: InjectionToken<T>, listener: (instance: T) => void): void {
        const binding = this.#bindings.get(token)
        if (!binding) throw new Error(notObservable(token))

        // Attached to the BINDING, not the container. A container-level listener is inherited downward and
        // matched by token, so a descendant shadowing this token would report its instance here too.
        binding.onActivation((_context: unknown, instance: unknown) => {
            listener(instance as T)
            return instance
        })
    }

    // Resolution
    // ========================================

    resolve<T>(token: InjectionToken<T>, recursive = true): T {
        if (!this.isRegistered(token, recursive)) {
            throw new Error(notRegistered(token, recursive))
        }
        return this.#inversify.get(this.#id(token))
    }

    resolveSafe<T>(token: InjectionToken<T>, recursive = true): T | undefined {
        if (!this.isRegistered(token, recursive)) return undefined
        return this.#inversify.get(this.#id(token))
    }

    resolveOr<T, F>(token: InjectionToken<T>, fallback: () => F, recursive?: boolean): T | F
    resolveOr<T, F>(token: InjectionToken<T>, fallback: F, recursive?: boolean): T | F
    resolveOr<T, F>(token: InjectionToken<T>, fallback: F | (() => F), recursive = true): T | F {
        if (this.isRegistered(token, recursive)) {
            return this.#inversify.get(this.#id(token))
        }

        if (typeof fallback === "function") {
            return (fallback as () => F)()
        }

        return fallback
    }

    resolveAll<T>(token: InjectionToken<T>): T[] {
        return this.#inversify.getAll(this.#id(token), { chained: true })
    }

    // Internals
    // ========================================

    #id<T>(token: InjectionToken<T>): ServiceIdentifier<T> {
        return token
    }

    /**
     * `useClass` derives its token from the implementation when `provide` is omitted; nothing else can.
     * Without this, the three token-less forms bind under `undefined` and stay resolvable through it —
     * a second one then collides on a token nobody wrote.
     *
     * `=== undefined` rather than `"provide" in provider`: an explicit `provide: undefined` is the same
     * mistake, and `useClass` already treats it as absent through its own `??`. No token type is `undefined`,
     * so nothing legitimate is rejected here.
     */
    #assertProvide(token: InjectionToken<unknown> | undefined, useKey: string): void {
        if (token === undefined) {
            throw new Error(missingProvide(useKey))
        }
    }

    #assertFree(token: InjectionToken<unknown>): void {
        if (this.#inversify.isCurrentBound(this.#id(token))) {
            throw new Error(alreadyRegistered(token))
        }
    }

    #bindClass(token: InjectionToken<unknown>, implementation: Constructor<unknown>, scope: Scope): void {
        const binding =
            token === implementation
                ? this.#inversify.bind(this.#id(token)).toSelf()
                : this.#inversify.bind(this.#id(token)).to(implementation)

        this.#bindings.set(token, this.#scoped(binding, scope))
    }

    #resolveDependencies(dependencies?: FactoryDependency[]): unknown[] {
        if (!dependencies?.length) return []

        return dependencies.map((dependency) => {
            if (isOptionalDependency(dependency)) {
                return this.resolveSafe(dependency.token)
            }
            return this.resolve(dependency)
        })
    }

    #scoped(binding: ScopedBinding, scope: Scope): ActivatableBinding {
        return scope === Scope.Transient ? binding.inTransientScope() : binding.inSingletonScope()
    }
}

// Helpers
// ========================================

type ActivatableBinding = { onActivation(handler: (context: any, instance: any) => any): unknown }
type ScopedBinding = { inSingletonScope(): ActivatableBinding; inTransientScope(): ActivatableBinding }

function isOptionalDependency(dependency: FactoryDependency): dependency is OptionalFactoryDependency<any> {
    return typeof dependency === "object" && dependency !== null && "optional" in dependency && dependency.optional
}

// Errors
// ========================================

/** How a provider is named in an error: by its token when it has one, else by what it is. */
function providerSubject(provider: unknown): string {
    const candidate = provider as { provide?: InjectionToken<unknown> } | null | undefined
    const isObject = candidate !== null && typeof candidate === "object"
    const provide = isObject ? candidate.provide : undefined

    return provide !== undefined
        ? `Provider for ${describeToken(provide)}`
        : isObject
          ? "Provider"
          : `Provider ${String(provider)}`
}

function invalidProvider(provider: unknown): string {
    return `${providerSubject(provider)} has no recognised form — expected a class, or an object with one of useClass, useValue, useFactory or useExisting.`
}

function mixedImplementationKeys(provider: unknown, keys: readonly string[]): string {
    return `${providerSubject(provider)} mixes ${keys.length} implementation keys (${keys.join(", ")}) — a provider declares exactly one of useClass, useValue, useFactory or useExisting. Note that an explicit \`undefined\` still counts as declared.`
}

function missingProvide(useKey: string): string {
    return `Provider with ${useKey} requires \`provide\` — only useClass may register under its own token, because a class is one. Give this provider an explicit token.`
}

function alreadyRegistered(token: InjectionToken<unknown>): string {
    return `Token ${describeToken(token)} is already registered on this container. One token, one registration — resolve several instances from separate containers with \`resolveAll\`, or give each provider its own token.`
}

function notObservable(token: InjectionToken<unknown>): string {
    return `Cannot observe ${describeToken(token)}: nothing is registered for it on this container. Register the provider before calling onResolution.`
}

function notRegistered(token: InjectionToken<unknown>, recursive: boolean): string {
    return recursive
        ? `Token ${describeToken(token)} is not registered in this container or any ancestor.`
        : `Token ${describeToken(token)} is not registered in this container (searched that container only).`
}
