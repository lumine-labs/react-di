import { Container, type DependencyContainer } from "../../aliases/index.js"

import type { ModuleResolution, ModuleResolutionParams } from "./resolution.types.js"
import { createModuleProviders } from "../providers/createModuleProviders.js"
import { ModuleMetadata } from "../providers/module-metadata/module-metadata.provider.js"
import { registerProviders } from "../providers/providers.js"
import { tryResolve } from "../resolve.js"
import { id } from "./id.js"

export function createModuleResolution(
    parent: DependencyContainer | null,
    params?: ModuleResolutionParams
): ModuleResolution {
    validateParams(params)

    const { container, owned } = resolveContainer(parent, params)
    if (!owned) {
        // An inherit module is a window onto an existing container: if that container's chain carries an
        // owned ancestor's ModuleMetadata, share its id (honest — same container, same identity). A bare
        // external container has no metadata in its chain, so fall back to a per-resolution generated id.
        const metadata = tryResolve(container, ModuleMetadata)
        return { container, owned, id: metadata?.id ?? id() }
    }

    // User-supplied ids are the addressable, rebuild-stable identity — params re-deliver the same string
    // on every render. A generated id is a per-resolution debug label: fresh on each rebuild, but since it
    // is unaddressable (nothing can look a module up by it), that instability is unobservable.
    const moduleId = params?.id ?? id()

    const { metadata, providers: moduleProviders } = createModuleProviders({ id: moduleId, container, parent })
    const userProviders = params?.providers ?? []
    const providers = [...moduleProviders, ...userProviders]
    metadata.setProviders(providers)

    try {
        registerProviders(container, moduleProviders)
        registerProviders(container, userProviders)
    } catch (error) {
        try {
            container.dispose()
        } catch {
            // noop
        }
        throw error
    }

    return { container, owned, id: moduleId }
}

export function resolveContainer(
    parent: DependencyContainer | null,
    params?: ModuleResolutionParams
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

export function validateParams(params?: ModuleResolutionParams): void {
    if (params?.container) {
        const checkMap = {
            id: !!(params as any)?.id,
            providers: !!params?.providers,
            rebuildOn: !!(params as any)?.rebuildOn,
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

    if (params?.root && ((params as any).container || (params as any).factory)) {
        throw new Error("`root` cannot be used with `container` or `factory`.")
    }
}
