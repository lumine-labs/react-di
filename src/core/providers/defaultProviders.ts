import type { DependencyContainer } from "../../aliases/index.js"

import type { Provider } from "./providers.types.js"
import { ContainerResolver, UNSAFE_CONTAINER_RESOLVER } from "./container-resolver/container-resolver.js"
import { Resolver } from "./resolver/resolver.js"

export function createDefaultProviders(container: DependencyContainer): Provider[] {
    return [
        { provide: UNSAFE_CONTAINER_RESOLVER, useValue: new ContainerResolver(container) },
        { provide: Resolver, useValue: new Resolver(container) },
    ] as const
}
