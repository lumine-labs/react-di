import React from "react"
import { type DependencyContainer } from "tsyringe"
import { ContainerContext } from "../container/useContainer"
import { registerProviders } from "../providers/providers"
import { type ModuleResolution, type UseModuleParams } from "./types"

export function useModule(params?: UseModuleParams): ModuleResolution {
    const parent = React.useContext(ContainerContext)

    const [resolution] = React.useState(() => {
        return createModuleResolution(parent, params)
    })

    return resolution
}

export function useModuleContainer(params?: UseModuleParams): DependencyContainer {
    const resolution = useModule(params)

    React.useEffect(() => {
        return () => cleanupModuleResolution(resolution)
    }, [])

    return resolution.container
}

export function createModuleResolution(parent: DependencyContainer | null, params?: UseModuleParams): ModuleResolution {
    if (params?.container && (params?.onModuleInit || params?.providers)) {
        throw new Error("useModule: `onModuleInit` and `providers` are not allowed in attach mode.")
    }

    const resolved = (() => {
        if (params?.container) {
            return { container: params.container, owned: false as const }
        }

        if (params?.factory) {
            const container = params.factory()
            if (!container) {
                throw new Error("useModule: factory() returned falsy.")
            }
            return { container, owned: true as const }
        }

        if (!parent) {
            throw new Error(
                "useModule: no parent container in context. Provide `factory` for root or `container` to attach."
            )
        }

        return { container: parent.createChildContainer(), owned: true as const }
    })()

    if (!resolved.owned) {
        return { container: resolved.container, owned: false }
    }

    let cfgCleanup: (() => void) | undefined

    try {
        if (params?.providers?.length) {
            registerProviders(resolved.container, params.providers)
        }

        const maybeCleanup = params?.onModuleInit?.(resolved.container)
        cfgCleanup = typeof maybeCleanup === "function" ? maybeCleanup : undefined
    } catch (error) {
        try {
            resolved.container.dispose()
        } catch {
            // noop
        }
        throw error
    }

    return {
        container: resolved.container,
        owned: true,
        cfgCleanup,
    }
}

export function cleanupModuleResolution(resolution: ModuleResolution): void {
    try {
        resolution.cfgCleanup?.()
    } catch (error) {
        console.error("module.cfgCleanup", error)
    }

    try {
        if (resolution.owned) {
            resolution.container.dispose()
        }
    } catch (error) {
        console.error("module.dispose", error)
    }
}
