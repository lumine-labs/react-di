import type { DependencyContainer } from "../aliases/index.js"
import type { Provider } from "./types.js"
import { Resolver } from "../resolver/index.js"

export function createDefaultProviders(container: DependencyContainer): Provider[] {
    return [
        { provide: Resolver, useValue: new Resolver(container) },
    ] as const
}
