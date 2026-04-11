import type { DependencyContainer } from "../aliases/index.js"
import type { Provider } from "./types.js"
import { Resolver } from "../resolver/index.js"
import { CleanupRegistry } from "../module-cleanup/index.js"

export function createDefaultProviders(container: DependencyContainer): Provider[] {
    return [
        { provide: Resolver, useValue: new Resolver(container) },
        { provide: CleanupRegistry, useValue: new CleanupRegistry() },
    ] as const
}
