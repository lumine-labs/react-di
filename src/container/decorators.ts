import { LazyServiceIdentifier, decorate, inject, injectable, multiInject, optional } from "inversify"

import type { InjectionToken } from "./container.types.js"

// Decorator surface
// ========================================

export const Injectable = injectable
export const Inject = inject
export const InjectAll = multiInject
export const Optional = optional

export { decorate }

// Deferred tokens
// ========================================

export function LazyToken<T>(token: () => InjectionToken<T>): LazyServiceIdentifier<T> {
    return new LazyServiceIdentifier(token)
}
