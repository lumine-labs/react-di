import {
    type DependencyContainer,
    type InjectionToken,
    Scope,
    type Scope as ScopeValue,
    ScopedFactory,
    SingletonFactory,
} from "../../aliases/index.js"
import type { FactoryDependency, Provider, ProviderScope } from "./providers.types.js"

export function registerProviders(container: DependencyContainer, providers: Provider[]): void {
    for (const provider of providers) {
        registerProvider(container, provider)
    }
}

export function registerProvider(container: DependencyContainer, provider: Provider): void {
    if (typeof provider === "function") {
        container.registerSingleton(provider)
        return
    }

    if ("useValue" in provider) {
        container.register(provider.provide, { useValue: provider.useValue })
        return
    }

    if ("useExisting" in provider) {
        container.register(provider.provide, { useToken: provider.useExisting })
        return
    }

    const scope = normalizeProviderScope(provider.scope)

    if ("useClass" in provider) {
        container.register(provider.provide, { useClass: provider.useClass }, { lifecycle: scope })
        return
    }

    if ("useFactory" in provider) {
        const factory = (c: DependencyContainer) =>
            provider.useFactory(...resolveFactoryDependencies(c, provider.inject))

        if (scope === Scope.Transient) {
            container.register(provider.provide, { useFactory: factory })
            return
        }

        if (scope === Scope.Singleton) {
            container.register(provider.provide, { useFactory: SingletonFactory(factory) })
            return
        }

        if (scope === Scope.ContainerScoped) {
            container.register(provider.provide, { useFactory: ScopedFactory(factory) })
            return
        }

        throw new Error(
            'registerProvider: scope "resolutionScoped" is not supported for factory providers. Use "transient", "singleton", or "containerScoped".'
        )
    }
}

function normalizeProviderScope(scope: ProviderScope | undefined): ScopeValue {
    if (scope === undefined || scope === "singleton") return Scope.Singleton
    if (scope === "transient") return Scope.Transient
    if (scope === "containerScoped") return Scope.ContainerScoped
    if (scope === "resolutionScoped") return Scope.ResolutionScoped
    return scope
}

function isOptionalFactoryDependency(
    dependency: FactoryDependency
): dependency is { token: InjectionToken<any>; optional: true } {
    return typeof dependency === "object" && dependency !== null && "optional" in dependency && dependency.optional
}

function resolveFactoryDependencies(container: DependencyContainer, dependencies?: FactoryDependency[]): unknown[] {
    if (!dependencies?.length) return []

    return dependencies.map((dependency) => {
        if (isOptionalFactoryDependency(dependency)) {
            return container.isRegistered(dependency.token, true) ? container.resolve(dependency.token) : undefined
        }
        return container.resolve(dependency)
    })
}
