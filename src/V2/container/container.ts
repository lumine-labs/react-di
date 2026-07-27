import { Container as InversifyContainer, type ServiceIdentifier } from "inversify"

import {
    Scope,
    type Constructor,
    type FactoryDependency,
    type InjectionToken,
    type OptionalFactoryDependency,
    type Provider,
} from "./container.types"
import { describeToken } from "../shared/describeToken"

// Container
// ========================================

export class Container {
    readonly #inversify: InversifyContainer

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
            this.#inversify.bind(this.#id(provider.provide)).toConstantValue(provider.useValue)
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

            this.#scoped(binding, scope)
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
        this.#inversify.onActivation(this.#id(token), (_context, instance) => {
            listener(instance)
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

        this.#scoped(binding, scope)
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

    #scoped(binding: ScopedBinding, scope: Scope): void {
        if (scope === Scope.Transient) {
            binding.inTransientScope()
            return
        }
        binding.inSingletonScope()
    }
}

// Helpers
// ========================================

type ScopedBinding = { inSingletonScope(): unknown; inTransientScope(): unknown }

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

function notRegistered(token: InjectionToken<unknown>, recursive: boolean): string {
    return recursive
        ? `Token ${describeToken(token)} is not registered in this container or any ancestor.`
        : `Token ${describeToken(token)} is not registered in this container (searched that container only).`
}
