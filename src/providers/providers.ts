import {
    type DependencyContainer,
    Lifecycle,
    isClassProvider,
    isFactoryProvider,
    isTokenProvider,
    isValueProvider,
} from "tsyringe"
import { type Provider, type ProviderScope } from "./types"

function mapScope(scope: ProviderScope): Lifecycle {
    switch (scope) {
        case "singleton":
            return Lifecycle.Singleton
        case "transient":
            return Lifecycle.Transient
        case "containerScoped":
            return Lifecycle.ContainerScoped
        case "resolutionScoped":
            return Lifecycle.ResolutionScoped
        default:
            return Lifecycle.Singleton
    }
}

export function registerProvider(container: DependencyContainer, provider: Provider): void {
    if (typeof provider === "function") {
        container.registerSingleton(provider)
        return
    }

    const scope = provider.scope ?? "singleton"
    const entry = provider.provider

    if (typeof entry === "function") {
        container.register(provider.provide, entry, { lifecycle: mapScope(scope) })
        return
    }

    if (isValueProvider(entry)) {
        container.register(provider.provide, entry)
        return
    }

    if (isFactoryProvider(entry)) {
        if (scope !== "transient") {
            throw new Error(
                `registerProvider: scope "${scope}" is not supported for factory providers. Use "transient" or wrap factory with tsyringe caching helpers.`
            )
        }

        container.register(provider.provide, entry)
        return
    }

    if (isClassProvider(entry) || isTokenProvider(entry)) {
        container.register(provider.provide, entry as any, { lifecycle: mapScope(scope) })
        return
    }

    container.register(provider.provide, entry as any)
}

export function registerProviders(container: DependencyContainer, providers: Provider[]): void {
    for (const provider of providers) {
        registerProvider(container, provider)
    }
}
