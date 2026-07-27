import { Container } from "../../container"
import type { ModuleResolution, ModuleResolutionParams } from "./resolution.types.js"
import { id } from "./id.js"

import { createModuleProviders } from "../providers/createModuleProviders"
import { ModuleMetadata } from "../providers/module-metadata/module-metadata.provider"

export function createModuleResolution(parent: Container | null, params?: ModuleResolutionParams): ModuleResolution {
    assertParams(params)

    // Build new container
    const container = resolveContainer(parent, params)
    assertContainerIsFree(container)

    // Prepare providers
    const moduleId = params?.id ?? id()
    const {
        metadata,
        lifecycle,
        providers: moduleProviders,
    } = createModuleProviders({ id: moduleId, container, parent })
    const userProviders = params?.providers ?? []

    // Register providers
    container.register(moduleProviders)
    container.register(userProviders)
    metadata.setProviders([...moduleProviders, ...userProviders])

    // Initialize lifecycle
    const { onModuleInit, onModuleMount, onModuleUnmount, onModuleDestroy, onModuleError } = params ?? {}
    lifecycle.init({ onModuleInit, onModuleMount, onModuleUnmount, onModuleDestroy, onModuleError })

    return { container, id: moduleId }
}

export function resolveContainer(parent: Container | null, params?: ModuleResolutionParams): Container {
    if (params?.root) {
        return new Container()
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

    return parent.fork()
}

export function assertParams(params?: ModuleResolutionParams): void {
    if (params?.root && params.factory) {
        throw new Error("`root` cannot be used with `factory`.")
    }
}

export function assertContainerIsFree(container: Container): void {
    const existing = container.resolveSafe(ModuleMetadata, false)
    if (!existing) return

    throw new Error(
        `Container already belongs to module "${existing.id}". One container = one module — give \`factory\` a fresh container, or drop \`factory\` to create a scoped child.`
    )
}
