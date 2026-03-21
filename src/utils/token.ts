import type { InjectionToken } from "../aliases/index.js"

const DEFAULT_TOKEN_NAMESPACE = "@lumelabs/react-di"
const declaredTokenKeys = new Set<string>()

export type TokenOptions = {
    namespace?: string
    allowDuplicate?: boolean
}

function buildTokenKey(name: string, namespace?: string): string {
    const ns = namespace?.trim() || DEFAULT_TOKEN_NAMESPACE
    return `${ns}:${name}`
}

export function Token<T = unknown>(name: string, options?: TokenOptions): InjectionToken<T> {
    const trimmedName = name.trim()
    if (!trimmedName) {
        throw new Error("Token: `name` must be a non-empty string.")
    }

    const key = buildTokenKey(trimmedName, options?.namespace)
    const allowDuplicate = options?.allowDuplicate ?? false

    if (!allowDuplicate && declaredTokenKeys.has(key)) {
        throw new Error(
            `Token: token "${key}" is already declared. Use a unique name/namespace or set { allowDuplicate: true }.`
        )
    }

    declaredTokenKeys.add(key)
    return Symbol.for(key)
}
