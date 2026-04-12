import { Container, type DependencyContainer } from "../aliases/index.js"

import type { ModuleResolution, UseModuleParams } from "./types.js"
import { registerProviders } from "../providers/index.js"
import { createDefaultProviders } from "../providers/defaultProviders.js"
import { collectLifecycleTokens } from "./lifecycle.js"

export function createModuleResolution(parent: DependencyContainer | null, params?: UseModuleParams): ModuleResolution {
    validateParams(params)

    const { container, owned } = resolveContainer(parent, params)
    if (!owned) {
        return { container, owned, registeredTokens: [] }
    }

    let registeredTokens: ModuleResolution["registeredTokens"] = []

    try {
        const providers = [...createDefaultProviders(container), ...(params?.providers ?? [])]
        registerProviders(container, providers)
        registeredTokens = collectLifecycleTokens(providers)
    } catch (error) {
        try {
            container.dispose()
        } catch {
            // noop
        }
        throw error
    }

    return { container, owned, registeredTokens }
}

function validateParams(params?: UseModuleParams): void {
    // Validate params when inheriting from a container
    if (params?.container) {
        const checkMap = {
            providers: !!params?.providers,
            onModuleInit: !!params?.onModuleInit,
            onModuleMount: !!params?.onModuleMount,
            onModuleUnmount: !!params?.onModuleUnmount,
            onModuleDestroy: !!params?.onModuleDestroy,
        }
        const keys = Object.keys(checkMap) as (keyof typeof checkMap)[]
        const conflictKeys = keys.filter((key) => checkMap[key])
        if (conflictKeys.length) {
            const conflictKeysStr = conflictKeys.map((key) => `\`${key}\``).join(", ")
            const verb = conflictKeys.length === 1 ? "is" : "are"
            throw new Error(`${conflictKeysStr} ${verb} not allowed when inheriting from a container.`)
        }
    }

    // Validate module mode combinations
    if (params?.root && ((params as any).container || (params as any).factory)) {
        throw new Error("`root` cannot be used with `container` or `factory`.")
    }
}

export function resolveContainer(
    parent: DependencyContainer | null,
    params?: UseModuleParams
): Pick<ModuleResolution, "container" | "owned"> {
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
