import type { DependencyContainer } from "../../aliases/index.js"

import type { Provider } from "./providers.types.js"
import { ContainerResolver, UNSAFE_CONTAINER_RESOLVER } from "./container-resolver/container-resolver.js"
import { ModuleMetadata } from "./module-metadata/module-metadata.js"
import { Resolver } from "./resolver/resolver.js"

export type DefaultProvidersParams = {
    id: string
}

export function createDefaultProviders(container: DependencyContainer, params: DefaultProvidersParams): Provider[] {
    const { id } = params
    return [
        { provide: UNSAFE_CONTAINER_RESOLVER, useValue: new ContainerResolver(container) },
        { provide: ModuleMetadata, useValue: new ModuleMetadata(id) },
        { provide: Resolver, useValue: new Resolver(container) },
    ] as const
}
