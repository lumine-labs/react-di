import { Container, type DependencyContainer } from "../aliases/index.js"

import type { ModuleResolution, UseModuleParams } from "./types.js"
import { registerProviders } from "../providers/index.js"
import { createDefaultProviders } from "../providers/defaultProviders.js"

export function createModuleResolution(parent: DependencyContainer | null, params?: UseModuleParams): ModuleResolution {
    validateParams(params)

    const { container, owned } = resolveContainer(parent, params)

    if (!owned) {
        return {
            container,
            owned: false,
        }
    }

    let cleanup: (() => void) | undefined

    try {
        const paramsProviders = params?.providers ?? []
        const providers = [...createDefaultProviders(container), ...paramsProviders]
        registerProviders(container, providers)

        const maybeCleanup = params?.onModuleInit?.(container)
        cleanup = typeof maybeCleanup === "function" ? maybeCleanup : undefined
    } catch (error) {
        try {
            container.dispose()
        } catch {
            // noop
        }
        throw error
    }

    return {
        container,
        owned: true,
        cleanup,
    }
}

function validateParams(params?: UseModuleParams): void {
    if (params?.container && (params?.onModuleInit || params?.providers)) {
        throw new Error("`onModuleInit` and `providers` are not allowed when inheriting from a container.")
    }

    if (params?.root && ((params as any).container || (params as any).factory)) {
        throw new Error("`root` cannot be used with `container` or `factory`.")
    }
}

export function resolveContainer(
    parent: DependencyContainer | null,
    params?: UseModuleParams
): Omit<ModuleResolution, "cleanup"> {
    if (params?.root) {
        return { container: Container.createChildContainer(), owned: true as const }
    }

    if (params?.container) {
        return { container: params.container, owned: false as const }
    }

    if (params?.factory) {
        const container = params.factory()
        if (!container) {
            throw new Error("factory() returned falsy.")
        }
        return { container, owned: true as const }
    }

    if (!parent) {
        throw new Error(
            "No parent container in context. Provide `root`, `factory` for root, or `container` to inherit."
        )
    }

    return { container: parent.createChildContainer(), owned: true as const }
}
