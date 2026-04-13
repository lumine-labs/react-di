import type { DependencyContainer, InjectionToken } from "../../aliases/index.js"

import type { ModuleResolution, ModuleResolutionParams } from "./resolution.types.js"
import type { ModuleHooks, ModuleLifecycle, ModuleResolutionLifecycle } from "./lifecycle.types.js"
import type { Provider } from "../providers/providers.types.js"
import { getProviderToken } from "../providers/getProviderToken.js"

// Resolve lifecycle logic for module resolution
// - moduleHooks - hooks for the container itself
// - lifecycleTokens - tokens for providers with lifecycle hooks
// - lifecycleInstances - resolved instances of providers with lifecycle hooks
export function createModuleResolutionLifecycle(
    resolution: ModuleResolution,
    params?: ModuleResolutionParams
): ModuleResolutionLifecycle {
    // Don't run lifecycle hooks if we inherit container
    if (!resolution.owned) {
        return {
            moduleHooks: {},
            lifecycleTokens: [],
            lifecycleInstances: [],
        }
    }

    const moduleHooks = extractModuleHooks(params)
    const lifecycleTokens = collectLifecycleTokens(resolution.providers)
    const lifecycleInstances = resolveProviderLifecycles(resolution.container, lifecycleTokens)

    return {
        moduleHooks,
        lifecycleTokens,
        lifecycleInstances,
    }
}

// Processors
// ========================================

function extractModuleHooks(params?: ModuleResolutionParams): ModuleHooks {
    return {
        onModuleInit: params?.onModuleInit,
        onModuleMount: params?.onModuleMount,
        onModuleUnmount: params?.onModuleUnmount,
        onModuleDestroy: params?.onModuleDestroy,
    }
}

function collectLifecycleTokens(providers: Provider[]): InjectionToken<any>[] {
    const tokens: InjectionToken<any>[] = []
    for (const provider of providers) {
        if (isUseExistingProvider(provider)) continue
        tokens.push(getProviderToken(provider))
    }
    return tokens
}

function resolveProviderLifecycles(container: DependencyContainer, tokens: InjectionToken<any>[]): ModuleLifecycle[] {
    const lifecycleInstances: ModuleLifecycle[] = []

    const tokenTotalCounts = countTokenOccurrences(tokens)
    const tokenSeenCounts = new Map<InjectionToken<any>, number>()
    const resolvedAllCache = new Map<InjectionToken<any>, unknown[]>()

    for (const token of tokens) {
        const resolved = resolveLifecycleInstance(container, token, tokenTotalCounts, tokenSeenCounts, resolvedAllCache)
        if (!isLifecycleCandidate(resolved)) continue

        lifecycleInstances.push(resolved)
    }

    return lifecycleInstances
}

function resolveLifecycleInstance(
    container: DependencyContainer,
    token: InjectionToken<any>,
    tokenTotalCounts: Map<InjectionToken<any>, number>,
    tokenSeenCounts: Map<InjectionToken<any>, number>,
    resolvedAllCache: Map<InjectionToken<any>, unknown[]>
): unknown {
    const seen = tokenSeenCounts.get(token) ?? 0
    tokenSeenCounts.set(token, seen + 1)

    const totalCount = tokenTotalCounts.get(token) ?? 0
    if (totalCount > 1) {
        let resolvedAll = resolvedAllCache.get(token)
        if (!resolvedAll) {
            resolvedAll = container.resolveAll(token)
            resolvedAllCache.set(token, resolvedAll)
        }
        if (seen < resolvedAll.length) {
            return resolvedAll.at(seen)
        }
        return resolvedAll.at(-1)
    }

    return container.resolve(token)
}

function countTokenOccurrences(tokens: InjectionToken<any>[]): Map<InjectionToken<any>, number> {
    const counts = new Map<InjectionToken<any>, number>()
    for (const token of tokens) {
        const current = counts.get(token) ?? 0
        counts.set(token, current + 1)
    }
    return counts
}

// Helpers
// ========================================

function isUseExistingProvider(provider: Provider): boolean {
    return typeof provider !== "function" && "useExisting" in provider
}

function isLifecycleCandidate(value: unknown): value is ModuleLifecycle {
    if (!value || typeof value !== "object") return false

    const candidate = value as ModuleLifecycle
    return Boolean(
        candidate.onModuleInit || candidate.onModuleMount || candidate.onModuleUnmount || candidate.onModuleDestroy
    )
}
