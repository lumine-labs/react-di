import type { Container, InjectionToken } from "../../../container/index.js"
import type { Module } from "../../module/module.js"

// ModuleRegistry
// ========================================

export class ModuleRegistry {
    constructor(private readonly module: Module) {}

    // Structure
    // ========================================

    attach(): void {
        this.module.parent?.addChild(this.module)
    }

    detach(): void {
        this.module.parent?.removeChild(this.module)
    }

    // Traversal
    // ========================================

    parent(): Container | null {
        return this.module.parent?.container ?? null
    }

    /** Nearest first, excluding self. */
    ancestors(): Container[] {
        const found: Container[] = []
        let current = this.module.parent
        while (current) {
            found.push(current.container)
            current = current.parent
        }
        return found
    }

    /** The outermost module in this tree, or own container when already a root. */
    findRoot(): Container {
        return this.ancestors().at(-1) ?? this.module.container
    }

    /** Direct children only, in attach order. A child appears here once it has mounted. */
    children(): Container[] {
        return [...this.module.children].map((child) => child.container)
    }

    /** Depth-first, excluding self. */
    descendants(): Container[] {
        const found: Container[] = []
        for (const child of this.module.children) {
            found.push(child.container)
            found.push(...new ModuleRegistry(child).descendants())
        }
        return found
    }

    findAncestorById(id: string): Container | null {
        let current = this.module.parent
        while (current) {
            if (current.id === id) return current.container
            current = current.parent
        }
        return null
    }

    findDescendantById(id: string): Container | null {
        for (const child of this.module.children) {
            if (child.id === id) return child.container
            const found = new ModuleRegistry(child).findDescendantById(id)
            if (found) return found
        }
        return null
    }

    /**
     * Nearest ancestor holding the token. Asks the container rather than the declared provider snapshot,
     * which cannot see registrations made after resolution.
     */
    findAncestorByProvider(token: InjectionToken<unknown>): Container | null {
        return this.ancestors().find((container) => container.isRegistered(token, "self")) ?? null
    }

    findDescendantsByProvider(token: InjectionToken<unknown>): Container[] {
        return this.descendants().filter((container) => container.isRegistered(token, "self"))
    }
}
