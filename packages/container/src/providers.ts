import type { ProviderUse } from "./providers.types.js"

// Provider grammar
// ========================================

/** The implementation keys, as a value: `register` counts how many of them an object declares. */
export const PROVIDER_USE_KEYS = [
    "useClass",
    "useFactory",
    "useExisting",
    "useValue",
] as const satisfies readonly (keyof ProviderUse)[]
