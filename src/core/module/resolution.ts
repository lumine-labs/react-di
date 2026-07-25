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

    const container = resolveContainer(parent, params)
    assertContainerIsFree(container)

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

    return { container, id: moduleId }
}

export function resolveContainer(
    parent: DependencyContainer | null,
    params?: ModuleResolutionParams
): DependencyContainer {
    if (params?.root) {
        return Container.createChildContainer()
    }

    if (params?.factory) {
        const container = params.factory()
        if (!container) {
            throw new Error("factory() returned falsy.")
        }
        return container
    }

    if (!parent) {
        throw new Error("No parent container in context. Provide `root` or `factory` for a root module.")
    }

    return parent.createChildContainer()
}

export function validateParams(params?: ModuleResolutionParams): void {
    if (params?.root && params.factory) {
        throw new Error("`root` cannot be used with `factory`.")
    }
}

/**
 * One container = one module. `root` and scoped modes always mint a fresh child container, so in
 * practice only `factory` can hand back a container that is already somebody's module.
 *
 * The registration check is non-recursive on purpose: a scoped child container resolves its parent's
 * `ModuleMetadata` through the chain, which is correct and must not be mistaken for a claim. Only a
 * registration made directly on this container means "this container is already a module".
 */
function assertContainerIsFree(container: DependencyContainer): void {
    const existing = tryResolve(container, ModuleMetadata, false)
    if (!existing) return

    throw new Error(
        `Container already belongs to module "${existing.id}". One container = one module — give \`factory\` a fresh container, or drop \`factory\` to create a scoped child.`
    )
}
