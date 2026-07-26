import { Container as InversifyContainer, type ServiceIdentifier } from "inversify"

import {
    Scope,
    type Constructor,
    type FactoryDependency,
    type InjectionToken,
    type OptionalFactoryDependency,
    type Provider,
} from "./container.types.js"

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

    register(provider: Provider): void {
        if (typeof provider === "function") {
            this.#bindClass(provider, provider, Scope.Singleton)
            return
        }

        // Guarded before the `in` checks below, which throw a raw TypeError on anything that is not an
        // object. Unreachable from TypeScript; reachable from JavaScript, and worth a real message there.
        if (provider === null || typeof provider !== "object") {
            throw new Error(invalidProvider(provider))
        }

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

        // Reachable only from JavaScript, or from a cast — the union has no sixth member. Registering
        // nothing at all is the worst outcome here: the token stays unbound and the failure surfaces later
        // as a resolution error somewhere unrelated.
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

    resolveAll<T>(token: InjectionToken<T>, chained = true): T[] {
        return this.#inversify.getAll(this.#id(token), { chained })
    }

    // Internals
    // ========================================

    #id<T>(token: InjectionToken<T>): ServiceIdentifier<T> {
        return token
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

function describe(token: InjectionToken<unknown>): string {
    if (typeof token === "function") return token.name || "(anonymous class)"
    if (typeof token === "symbol") return token.description ?? token.toString()
    return String(token)
}

function invalidProvider(provider: never): string {
    const candidate = provider as { provide?: InjectionToken<unknown> } | null | undefined
    const isObject = candidate !== null && typeof candidate === "object"
    const provide = isObject ? candidate.provide : undefined

    const subject =
        provide !== undefined
            ? `Provider for ${describe(provide)}`
            : isObject
              ? "Provider"
              : `Provider ${String(provider)}`

    return `${subject} has no recognised form — expected a class, or an object with one of useClass, useValue, useFactory or useExisting.`
}

function notRegistered(token: InjectionToken<unknown>, recursive: boolean): string {
    return recursive
        ? `Token ${describe(token)} is not registered in this container or any ancestor.`
        : `Token ${describe(token)} is not registered in this container (searched that container only).`
}
