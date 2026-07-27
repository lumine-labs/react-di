import type { Container, InjectionToken } from "../../../container/index.js"
import { ModuleMetadata } from "../module-metadata/module-metadata.provider.js"

// ModuleRegistry
// ========================================

export class ModuleRegistry {
    constructor(private readonly metadata: ModuleMetadata) {}

    // Structure
    // ========================================

    attach(): void {
        resolveMetadata(this.metadata.parent)?.addChild(this.metadata.container)
    }

    detach(): void {
        resolveMetadata(this.metadata.parent)?.removeChild(this.metadata.container)
    }

    // Traversal
    // ========================================

    parent(): Container | null {
        return resolveMetadata(this.metadata.parent) ? this.metadata.parent : null
    }

    /** Nearest first, excluding self. */
    ancestors(): Container[] {
        const found: Container[] = []
        let current = resolveMetadata(this.metadata.parent)
        while (current) {
            found.push(current.container)
            current = resolveMetadata(current.parent)
        }
        return found
    }

    /** The outermost module in this tree, or own container when already a root. */
    findRoot(): Container {
        return this.ancestors().at(-1) ?? this.metadata.container
    }

    /** Direct children only, in attach order. A child appears here once it has mounted. */
    children(): Container[] {
        return [...this.metadata.children]
    }

    /** Depth-first, excluding self. */
    descendants(): Container[] {
        const found: Container[] = []
        for (const container of this.metadata.children) {
            found.push(container)
            const child = resolveMetadata(container)
            if (child) found.push(...new ModuleRegistry(child).descendants())
        }
        return found
    }

    findAncestorById(id: string): Container | null {
        return this.ancestors().find((container) => idOf(container) === id) ?? null
    }

    findDescendantById(id: string): Container | null {
        return this.descendants().find((container) => idOf(container) === id) ?? null
    }

    /**
     * Nearest ancestor holding the token. Asks the container rather than `metadata.providers`, which is a
     * declared snapshot and cannot see registrations made after resolution.
     */
    findAncestorByProvider(token: InjectionToken<unknown>): Container | null {
        return this.ancestors().find((container) => container.isRegistered(token, false)) ?? null
    }

    findDescendantsByProvider(token: InjectionToken<unknown>): Container[] {
        return this.descendants().filter((container) => container.isRegistered(token, false))
    }
}

// Helpers
// ========================================

function resolveMetadata(container: Container | null): ModuleMetadata | null {
    if (!container) return null
    return container.resolveSafe(ModuleMetadata, false) ?? null
}

function idOf(container: Container): string | undefined {
    return resolveMetadata(container)?.id
}
