import { LazyServiceIdentifier, decorate, inject, injectable, multiInject, optional } from "inversify"

import type { InjectionToken } from "./container.types.js"

// Decorator surface
// ========================================

export function Injectable(): ClassDecorator {
    return injectable()
}

export const Inject = inject

export function InjectAll(token: Parameters<typeof multiInject>[0]): ReturnType<typeof multiInject> {
    return multiInject(token, { chained: true })
}

export const Optional = optional

export { decorate }

// Deferred tokens
// ========================================

export function LazyToken<T>(token: () => InjectionToken<T>): LazyServiceIdentifier<T> {
    return new LazyServiceIdentifier(token)
}
