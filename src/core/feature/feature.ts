import type { Provider } from "../../container/index.js"

// Feature
// ========================================

const FEATURE = Symbol("@luminelabs/remodulo:feature")

export type Feature = {
    readonly [FEATURE]: true
    readonly name?: string
    readonly providers: readonly ProviderInput[]
}

export type ProviderInput = Provider | Feature

export function createFeature({ name, providers }: { name?: string; providers: readonly ProviderInput[] }): Feature {
    return Object.freeze<Feature>({
        [FEATURE]: true,
        ...(name !== undefined && { name }),
        providers: Object.freeze([...providers]),
    })
}

// Flattening
// ========================================

function isFeature(input: ProviderInput): input is Feature {
    return typeof input === "object" && input !== null && FEATURE in input
}

export function flattenProviders(inputs: readonly ProviderInput[]): Provider[] {
    const flat: Provider[] = []
    const visited = new Set<Feature>()

    const walk = (items: readonly ProviderInput[]): void => {
        for (const item of items) {
            if (!isFeature(item)) {
                flat.push(item)
                continue
            }

            if (visited.has(item)) continue
            visited.add(item)
            walk(item.providers)
        }
    }

    walk(inputs)

    return flat
}
