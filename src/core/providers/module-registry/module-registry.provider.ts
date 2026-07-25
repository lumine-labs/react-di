import type { DependencyContainer } from "../../../aliases/index.js"
import { ModuleMetadata } from "../module-metadata/module-metadata.provider.js"

// ModuleRegistry
// ========================================

/**
 * Structure service — the sole mutator of the lifecycle tree.
 *
 * Owns attach/detach of a module into its lifecycle parent's children set, plus minimal read-only
 * traversal primitives. Public discovery hooks are intentionally out of scope.
 */
export class ModuleRegistry {
    constructor(private readonly metadata: ModuleMetadata) {}

    /**
     * Add own container to the lifecycle parent's children set. Idempotent (Set). No parent metadata
     * (a lifecycle root) → no-op.
     */
    attach(): void {
        const parent = this.parentMetadata()
        if (!parent) return
        parent.addChild(this.metadata.container)
    }

    /**
     * Remove own container from the lifecycle parent's children set. Idempotent, safe if never attached
     * or if the parent is already gone.
     */
    detach(): void {
        const parent = this.parentMetadata()
        if (!parent) return
        parent.removeChild(this.metadata.container)
    }

    /** The lifecycle parent's own `ModuleMetadata`. `null` at a lifecycle root. */
    parentMetadata(): ModuleMetadata | null {
        return resolveMetadata(this.metadata.parent)
    }

    /** Metadata of each attached child, in insertion (commit) order. */
    *childrenMetadata(): IterableIterator<ModuleMetadata> {
        for (const container of this.metadata.children) {
            const child = resolveMetadata(container)
            if (child) yield child
        }
    }

    /** Walk the ancestor chain (nearest parent first), excluding self. */
    *ancestors(): IterableIterator<ModuleMetadata> {
        let current = this.parentMetadata()
        while (current) {
            yield current
            current = resolveMetadata(current.parent)
        }
    }

    /** The lifecycle root of this module's tree (self if already a root). */
    findRoot(): ModuleMetadata {
        let current: ModuleMetadata = this.metadata
        let parent = resolveMetadata(current.parent)
        while (parent) {
            current = parent
            parent = resolveMetadata(current.parent)
        }
        return current
    }
}

// Helpers
// ========================================

/**
 * The `ModuleMetadata` a container registers itself, or `null`.
 *
 * Non-recursive, and that is the whole point: one container = one module, so the metadata a container
 * holds directly IS its module. A chain lookup would happily walk out of a plain tsyringe child
 * container into the enclosing module and report someone else's node as this one's.
 */
function resolveMetadata(container: DependencyContainer | null): ModuleMetadata | null {
    if (!container) return null
    try {
        if (!container.isRegistered(ModuleMetadata, false)) return null
        return container.resolve(ModuleMetadata)
    } catch {
        return null
    }
}
