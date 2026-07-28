import { Container as InversifyContainer, type ServiceIdentifier } from "inversify"

import {
    Scope,
    type Constructor,
    type FactoryDependency,
    type InjectionToken,
    type OptionalFactoryDependency,
    type Provider,
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

        if (typeof provider === "function") {
            this.#assertFree(provider)
            this.#bindClass(provider, provider, Scope.Singleton)
            return
        }

        if (provider === null || typeof provider !== "object") {
            throw new Error(invalidProvider(provider))
        }

        this.#assertFree(provider.provide)

        if ("useValue" in provider) {
            const binding = this.#inversify.bind(this.#id(provider.provide)).toConstantValue(provider.useValue)
            this.#bindings.set(provider.provide, binding)
            return
        }

        if ("useExisting" in provider) {
            this.#inversify.bind(this.#id(provider.provide)).toService(this.#id(provider.useExisting))
            return
        }

        const scope = provider.scope ?? Scope.Singleton

        if ("useClass" in provider) {
            this.#bindClass(provider.provide, provider.useClass, scope)
            return
        }

        if ("useFactory" in provider) {
            const factory = provider.useFactory

            const dependencies = provider.inject

            const binding = this.#inversify
                .bind(this.#id(provider.provide))
                .toDynamicValue(() => factory(...this.#resolveDependencies(dependencies)))
            const activatable = this.#scoped(binding, scope)
            this.#bindings.set(provider.provide, activatable)

            return
        }

        throw new Error(invalidProvider(provider))
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

    // Construction
    // ========================================

    construct<T>(cls: Constructor<T>): T {
        // Build in a throwaway child so THIS container is never mutated: bind the class to itself
        // transiently, resolve once — its @Inject deps chain up to this container — then discard the
        // child. Nothing is registered here, a fresh instance comes back every call, and an unresolved
        // dependency throws from `get` (inversify has no resolve-unregistered-class primitive in 8.x).
        const scratch = new InversifyContainer({ parent: this.#inversify, jitless: true })
        scratch.bind(this.#id(cls)).toSelf().inTransientScope()
        return scratch.get(this.#id(cls))
    }

    // Internals
    // ========================================

    #id<T>(token: InjectionToken<T>): ServiceIdentifier<T> {
        return token
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

function invalidProvider(provider: never): string {
    const candidate = provider as { provide?: InjectionToken<unknown> } | null | undefined
    const isObject = candidate !== null && typeof candidate === "object"
    const provide = isObject ? candidate.provide : undefined

    const subject =
        provide !== undefined
            ? `Provider for ${describeToken(provide)}`
            : isObject
              ? "Provider"
              : `Provider ${String(provider)}`

    return `${subject} has no recognised form — expected a class, or an object with one of useClass, useValue, useFactory or useExisting.`
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
