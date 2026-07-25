import type { DependencyContainer } from "../../aliases/index.js"

import type { Provider } from "./providers.types.js"
import { ModuleLifecycle } from "./module-lifecycle/module-lifecycle.provider.js"
import { ModuleMetadata } from "./module-metadata/module-metadata.provider.js"
import { ModuleRegistry } from "./module-registry/module-registry.provider.js"
import { Resolver } from "./resolver/resolver.provider.js"

export type ModuleProvidersParams = {
    id: string
    container: DependencyContainer
    parent: DependencyContainer | null
}

export type ModuleProviders = {
    resolver: Resolver
    metadata: ModuleMetadata
    registry: ModuleRegistry
    lifecycle: ModuleLifecycle
    providers: Provider[]
}

export function createModuleProviders(params: ModuleProvidersParams): ModuleProviders {
    const { id, container, parent } = params

    const resolver = new Resolver(container)
    const metadata = new ModuleMetadata({ id, container, parent })
    const registry = new ModuleRegistry(metadata)
    const lifecycle = new ModuleLifecycle(metadata, registry)

    const providers: Provider[] = [
        { provide: Resolver, useValue: resolver },
        { provide: ModuleMetadata, useValue: metadata },
        { provide: ModuleRegistry, useValue: registry },
        { provide: ModuleLifecycle, useValue: lifecycle },
    ]

    return { resolver, metadata, registry, lifecycle, providers }
}
