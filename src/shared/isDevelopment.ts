// isDevelopment
// ========================================

// Gate for development-only diagnostics: verbose error text, module labels, DevTools names.
//
// Bundlers replace `process.env.NODE_ENV` at build time, but nothing replaces it when the ESM is loaded
// unbundled — an import map or a CDN — where `process` does not exist at all and a bare reference throws
// `ReferenceError`. When we cannot tell, we behave as production: terse messages, no labels.
//
// Evaluated per call rather than cached at module scope, so tests can drive both paths with `vi.stubEnv`.
export function isDevelopment(): boolean {
    return typeof process !== "undefined" && process.env?.NODE_ENV !== "production"
}
