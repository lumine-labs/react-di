import type { InjectionToken } from "../container/container.types.js"

// describeToken
// ========================================

/**
 * Human-readable rendering of an injection token, for error messages and dev labels.
 */
export function describeToken(token: InjectionToken<unknown>): string {
    if (typeof token === "string") return token
    if (typeof token === "symbol") return token.description ?? token.toString()
    if (typeof token === "function") return token.name || "(anonymous)"

    try {
        return String(token)
    } catch {
        return "(unknown token)"
    }
}
