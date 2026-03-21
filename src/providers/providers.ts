import {
    type DependencyContainer,
    Scope as TsLifecycle,
    type InjectionToken,
    type RegistrationOptions,
    SingletonFactory,
    ScopedFactory,
} from "../aliases/index.js"
import { type FactoryDependency, type Provider, type Scope } from "./types.js"

function mapScope(scope: Scope): RegistrationOptions["lifecycle"] {
    switch (scope) {
        case "singleton":
            return TsLifecycle.Singleton
        case "transient":
            return TsLifecycle.Transient
        case "containerScoped":
            return TsLifecycle.ContainerScoped
        case "resolutionScoped":
            return TsLifecycle.ResolutionScoped
        default:
            return TsLifecycle.Singleton
    }
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

    const scope = provider.scope ?? "singleton"

    if ("useClass" in provider) {
        container.register(provider.provide, { useClass: provider.useClass }, { lifecycle: mapScope(scope) })
        return
    }

    if ("useFactory" in provider) {
        const factory = (c: DependencyContainer) =>
            provider.useFactory(c, ...resolveFactoryDependencies(c, provider.inject))

        if (scope === "transient") {
            container.register(provider.provide, { useFactory: factory })
            return
        }

        if (scope === "singleton") {
            container.register(provider.provide, { useFactory: SingletonFactory(factory) })
            return
        }

        if (scope === "containerScoped") {
            container.register(provider.provide, { useFactory: ScopedFactory(factory) })
            return
        }

        throw new Error(
            'registerProvider: scope "resolutionScoped" is not supported for factory providers. Use "transient", "singleton", or "containerScoped".'
        )
    }
}

export function registerProviders(container: DependencyContainer, providers: Provider[]): void {
    for (const provider of providers) {
        registerProvider(container, provider)
    }
}
