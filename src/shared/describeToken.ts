// describeToken
// ========================================

/**
 * Human-readable rendering of an injection token, for error messages and dev labels.
 *
 * Symbols render as `Symbol(API_URL)`, classes and functions as their `.name`, strings as themselves.
 * Anything else falls back to a `String()` that cannot throw: a description is built while an error is
 * already being constructed, so it must never become the failure itself.
 */
export function describeToken(token: unknown): string {
    if (typeof token === "string") return token
    if (typeof token === "symbol") return token.toString()
    if (typeof token === "function") return token.name || "(anonymous)"

    try {
        return String(token)
    } catch {
        return "(unknown token)"
    }
}
