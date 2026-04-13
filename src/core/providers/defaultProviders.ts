import type { DependencyContainer } from "../../aliases/index.js"

import type { Provider } from "./providers.types.js"
import { Resolver } from "./resolver/resolver.js"

export function createDefaultProviders(container: DependencyContainer): Provider[] {
    return [{ provide: Resolver, useValue: new Resolver(container) }] as const
}
