import type { Provider } from "./types.js"
import { Resolver } from "../resolver/index.js"
import { CleanupRegistry } from "../module-cleanup/index.js"

export const DEFAULT_PROVIDERS: Provider[] = [
    { provide: Resolver, useFactory: (c) => new Resolver(c) },
    { provide: CleanupRegistry, useFactory: () => new CleanupRegistry() },
] as const
