import type { Container } from "./container.js"
import type { InjectionToken } from "./container.types.js"

// The frame
// ========================================
//
// A single synchronous cache of the container that is about to construct. `container` is the DECLARING
// container of the binding being built — never the one the read started from — which is what keeps an
// ancestor's service blind to its descendants' registrations.

/** Per-graph instance cache for `Scope.Request`, keyed by binding. */
export type RequestCache = Map<object, unknown>

export type Frame = {
    readonly container: Container
    readonly request: RequestCache
    /** Tokens currently under construction, outermost first. Revisiting one is a cycle. */
    readonly chain: readonly InjectionToken[]
}
