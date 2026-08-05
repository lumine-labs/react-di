import type {
    Constructor,
    ExistingProvider,
    FactoryProvider as KernelFactoryProvider,
    SelfClassProvider as KernelSelfClassProvider,
    TokenClassProvider as KernelTokenClassProvider,
    ValueProvider,
} from "@remodulo/container/types"

// Providers
// ========================================

type Lazy<P> = P & {
    /** Skip construction during the owner's eager pass; build on first resolve instead. */
    lazy?: boolean
}

export type TokenClassProvider<T = any> = Lazy<KernelTokenClassProvider<T>>
export type SelfClassProvider<T = any> = Lazy<KernelSelfClassProvider<T>>
export type ClassProvider<T = any> = TokenClassProvider<T> | SelfClassProvider<T>
export type FactoryProvider<T = any> = Lazy<KernelFactoryProvider<T>>
export type { ExistingProvider, ValueProvider }

export type Provider<T = any> =
    Constructor<T> | ClassProvider<T> | ValueProvider<T> | FactoryProvider<T> | ExistingProvider<T>
