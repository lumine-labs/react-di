import type { DependencyContainer, InjectionToken } from "../aliases/index.js"
import type { Provider } from "../providers/types.js"
import { getProviderToken } from "../providers/index.js"

import type {
    ModuleHooks,
    ModuleLifecycle,
    ModuleResolution,
    ModuleResolutionLifecycle,
    UseModuleParams,
} from "./types.js"

export type LifecycleMethod = "onModuleMount" | "onModuleUnmount" | "onModuleDestroy"
export type ModuleLifecycleMethod = "onModuleMount" | "onModuleUnmount" | "onModuleDestroy"

// Resolve lifecycle logic for module resolution
// - moduleHooks - hooks for the container itself
// - lifecycleTokens - tokens for providers with lifecycle hooks
// - lifecycleInstances - resolved instances of providers with lifecycle hooks
export function createModuleResolutionLifecycle(
    resolution: ModuleResolution,
    params?: UseModuleParams
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
    const lifecycleTokens = resolution.registeredTokens
    const lifecycleInstances = resolveProviderLifecycles(resolution.container, lifecycleTokens)

    return {
        moduleHooks,
        lifecycleTokens,
        lifecycleInstances,
    }
}

export function runModuleInitLifecycle(resolution: ModuleResolution, lifecycle: ModuleResolutionLifecycle): void {
    try {
        lifecycle.moduleHooks?.onModuleInit?.(resolution.container)
    } catch (error) {
        console.error("module.onModuleInit", error)
        throw error
    }

    const instances = lifecycle.lifecycleInstances ?? []
    for (const instance of instances) {
        try {
            instance.onModuleInit?.()
        } catch (error) {
            console.error("provider.onModuleInit", error)
            throw error
        }
    }
}

export function runModuleMountLifecycle(resolution: ModuleResolution, lifecycle: ModuleResolutionLifecycle): void {
    runModuleHook(resolution, lifecycle, "onModuleMount")
    runProviderLifecycles(lifecycle.lifecycleInstances, "onModuleMount")
}

export function runModuleUnmountLifecycle(resolution: ModuleResolution, lifecycle: ModuleResolutionLifecycle): void {
    runProviderLifecycles(lifecycle.lifecycleInstances, "onModuleUnmount", true)
    runModuleHook(resolution, lifecycle, "onModuleUnmount")
}

export function runModuleDestroyLifecycle(resolution: ModuleResolution, lifecycle: ModuleResolutionLifecycle): void {
    runProviderLifecycles(lifecycle.lifecycleInstances, "onModuleDestroy", true)
    runModuleHook(resolution, lifecycle, "onModuleDestroy")
}

export function extractModuleHooks(params?: UseModuleParams): ModuleHooks {
    return {
        onModuleInit: params?.onModuleInit,
        onModuleMount: params?.onModuleMount,
        onModuleUnmount: params?.onModuleUnmount,
        onModuleDestroy: params?.onModuleDestroy,
    }
}

export function collectLifecycleTokens(providers: Provider[]): InjectionToken<any>[] {
    const tokens: InjectionToken<any>[] = []
    for (const provider of providers) {
        if (isUseExistingProvider(provider)) continue
        tokens.push(getProviderToken(provider))
    }
    return tokens
}

function resolveProviderLifecycles(
    container: DependencyContainer,
    lifecycleTokens: InjectionToken<any>[]
): ModuleLifecycle[] {
    const lifecycleInstances: ModuleLifecycle[] = []
    const tokenTotalCounts = countTokenOccurrences(lifecycleTokens)
    const tokenSeenCounts = new Map<InjectionToken<any>, number>()
    const resolvedAllCache = new Map<InjectionToken<any>, unknown[]>()

    for (const token of lifecycleTokens) {
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
            return resolvedAll[seen]
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

export function runProviderLifecycles(
    instances: ModuleResolutionLifecycle["lifecycleInstances"],
    method: LifecycleMethod,
    reverse = false
): void {
    if (!instances?.length) return

    const ordered = reverse ? [...instances].reverse() : instances
    for (const instance of ordered) {
        try {
            instance[method]?.()
        } catch (error) {
            console.error(`provider.${method}`, error)
        }
    }
}

function runModuleHook(
    resolution: ModuleResolution,
    lifecycle: ModuleResolutionLifecycle,
    method: ModuleLifecycleMethod
): void {
    try {
        lifecycle.moduleHooks?.[method]?.(resolution.container)
    } catch (error) {
        console.error(`module.${method}`, error)
    }
}

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
