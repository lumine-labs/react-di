import type { InjectionToken } from "../../aliases/index.js"

const DEFAULT_TOKEN_NAMESPACE = "@lumelabs/react-di"

export type TokenOptions = {
    allowDuplicate?: boolean
}

export type Tokenizer = <T = unknown>(name: string, options?: TokenOptions) => InjectionToken<T>

function buildTokenKey(name: string, namespace: string): string {
    return `${namespace}:${name}`
}

export function makeTokenizer(namespace = DEFAULT_TOKEN_NAMESPACE): Tokenizer {
    const defaultNamespace = namespace.trim() || DEFAULT_TOKEN_NAMESPACE
    const declaredTokenKeys = new Set<string>()

    return function Token<T = unknown>(name: string, options?: TokenOptions): InjectionToken<T> {
        const trimmedName = name.trim()
        if (!trimmedName) {
            throw new Error("Token: `name` must be a non-empty string.")
        }

        const key = buildTokenKey(trimmedName, defaultNamespace)
        const allowDuplicate = options?.allowDuplicate ?? false

        if (!allowDuplicate && declaredTokenKeys.has(key)) {
            throw new Error(
                `Token: token "${key}" is already declared. Use a unique name/namespace or set { allowDuplicate: true }.`
            )
        }

        declaredTokenKeys.add(key)
        return Symbol.for(key)
    }
}

export const Token = makeTokenizer(DEFAULT_TOKEN_NAMESPACE)
