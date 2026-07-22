import type { DependencyContainer } from "../../../aliases/index.js"
import type { Provider } from "../providers.types.js"

// ModuleMetadata
// ========================================

export type ModuleMetadataInit = {
    id: string
    container: DependencyContainer
    parent: DependencyContainer | null
    providers?: readonly Provider[]
}

/**
 * Pure per-module data record. Zero behavior beyond getters.
 *
 * The single public infrastructure-facing door onto a module's container and its place in the
 * lifecycle tree. Services should depend on their injected dependencies, not on module topology;
 * mutating a container you did not create is undefined behavior.
 */
export class ModuleMetadata {
    /** Stable string identity of the module. */
    readonly id: string

    /** Own tsyringe container. */
    readonly container: DependencyContainer

    /** Lifecycle parent's container (the React-context parent), or `null` for a lifecycle root. */
    readonly parent: DependencyContainer | null

    /** @internal — structural, mutated only by ModuleRegistry. Insertion order = commit order. */
    private readonly _children = new Set<DependencyContainer>()

    /** @internal — snapshot, set once by createModuleResolution. */
    private _providers: readonly Provider[]

    /** @internal — lifecycle flag, mutated only by ModuleLifecycle. */
    committed = false
    /** @internal — lifecycle flag, mutated only by ModuleLifecycle. */
    mounted = false
    /** @internal — lifecycle flag, mutated only by ModuleLifecycle. */
    pendingTeardown = false

    constructor(init: ModuleMetadataInit) {
        this.id = init.id
        this.container = init.container
        this.parent = init.parent
        this._providers = init.providers ?? []
    }

    /** Attached child containers (insertion order = commit order). */
    get children(): ReadonlySet<DependencyContainer> {
        return this._children
    }

    /** @internal — used only by ModuleRegistry. */
    addChild(container: DependencyContainer): void {
        this._children.add(container)
    }

    /** @internal — used only by ModuleRegistry. */
    removeChild(container: DependencyContainer): void {
        this._children.delete(container)
    }

    /**
     * Declared provider snapshot — not a live registry. Dynamic registrations made directly on the
     * container do not appear here. Never use for resolution decisions — ask the container
     * (`isRegistered`/`resolve`); this list cannot see dynamic registrations, `useExisting` chains, or
     * parent-chain lookups.
     */
    get providers(): readonly Provider[] {
        return this._providers
    }

    /** @internal — used only by createModuleResolution. */
    setProviders(providers: readonly Provider[]): void {
        this._providers = providers
    }
}
