import { LazyServiceIdentifier, decorate, inject, injectable, multiInject, optional } from "inversify"

// Decorator surface
// ========================================

export const Injectable = injectable
export const Inject = inject
export const InjectAll = multiInject
export const Optional = optional

export const Delay = LazyServiceIdentifier

/**
 * Applies a decorator without decorator syntax. Needed wherever the toolchain does not emit
 * `design:paramtypes` — esbuild and anything built on it (tsx, Vite's default transform) never do, so
 * `@Inject(TOKEN)` on every constructor parameter is mandatory there. Measured, not assumed.
 */
export { decorate }

