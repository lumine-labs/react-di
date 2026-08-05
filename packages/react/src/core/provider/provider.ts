import { inject, injectAll, injectOptional, type Container } from "@remodulo/container"
import type { EntryMetadata, InjectionToken, Provider as KernelProvider } from "@remodulo/container/types"

import { lazyMismatch } from "./provider.errors.js"
import type {
    FactoryDependency,
    FactoryProvider,
    MultiFactoryDependency,
    OptionalFactoryDependency,
    Provider,
} from "./provider.types.js"

// Metadata channel
// ========================================

/** The one metadata key react claims on the kernel's opaque bag. */
export const LAZY_METADATA_KEY = "lazy"

/** True when the entry the kernel snapshotted was declared `lazy: true` at the react layer. */
export function isLazyMetadata(metadata: EntryMetadata | undefined): boolean {
    return metadata?.[LAZY_METADATA_KEY] === true
}

// Registration
// ========================================

/**
 * Register react providers on a kernel container: `lazy` becomes entry metadata, a factory's `inject`
 * array becomes `inject()` calls in the factory body, and collections are held to one verdict about `lazy`.
 */
export function registerProviders(container: Container, providers: readonly Provider[]): void {
    // Per call, which is per module: `lazy` is a claim about one owner's eager pass, never about the chain.
    const declaredLazy = new Map<InjectionToken, boolean>()

    for (const provider of providers) {
        // The kernel settles mode and alias first, so its messages stay ahead of anything about `lazy`.
        container.register(toKernelProvider(provider))
        claimLazy(declaredLazy, provider)
    }
}

/** Strip react's own keys, folding `lazy` into the kernel's metadata bag and `inject` into the factory. */
function toKernelProvider(provider: Provider): KernelProvider {
    if (typeof provider !== "object" || provider === null) return provider as KernelProvider

    const lazy = "lazy" in provider && provider.lazy === true
    const dependencies = "inject" in provider ? provider.inject : undefined

    if (!lazy && !("lazy" in provider) && dependencies === undefined) return provider as KernelProvider

    const { lazy: _lazy, inject: _inject, ...rest } = provider as unknown as Record<string, unknown>

    if (dependencies !== undefined && typeof rest.useFactory === "function") {
        rest.useFactory = bindFactory((provider as FactoryProvider).useFactory, dependencies)
    }
    if (lazy) {
        rest.metadata = { [LAZY_METADATA_KEY]: true } satisfies EntryMetadata
    }

    return rest as unknown as KernelProvider
}

/**
 * Route each `inject` entry to the read it names, from inside the kernel's construction frame. Routing
 * only: every mode default and every error belongs to the read being called, so a factory dependency
 * behaves exactly as the same call written by hand would.
 */
function bindFactory(factory: (...args: any[]) => unknown, dependencies: FactoryDependency[]): () => unknown {
    if (dependencies.length === 0) return factory

    return () =>
        factory(
            ...dependencies.map((dependency) => {
                // The shorthand: one value, nearest, required.
                if (!isDependencyOptions(dependency)) return inject(dependency)

                // `mode` is passed through undefined and all: the read owns its default.
                if (dependency.multi === true) return injectAll(dependency.token, dependency.mode)

                return dependency.optional === true
                    ? injectOptional(dependency.token, dependency.mode)
                    : inject(dependency.token, dependency.mode)
            })
        )
}

/** Settle a collection's laziness against everything already registered for the token in this pass. */
function claimLazy(declaredLazy: Map<InjectionToken, boolean>, provider: Provider): void {
    if (typeof provider !== "object" || provider === null) return
    if (provider.multi !== true) return

    // A value is already an instance and an alias builds nothing, so neither has laziness to disagree about.
    if (!("useClass" in provider) && !("useFactory" in provider)) return

    const token = provider.provide
    if (token === undefined) return

    const lazy = provider.lazy === true
    const declared = declaredLazy.get(token)
    if (declared !== undefined && declared !== lazy) {
        throw new Error(lazyMismatch(token, declared, lazy))
    }
    declaredLazy.set(token, lazy)
}

// Helpers
// ========================================

/** Object form or bare token: no `InjectionToken` is `typeof "object"`, so the check is the whole test. */
function isDependencyOptions(
    dependency: FactoryDependency
): dependency is MultiFactoryDependency<any> | OptionalFactoryDependency<any> {
    return typeof dependency === "object" && dependency !== null
}
