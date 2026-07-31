import type { ModuleHooks, ProviderLifecycle } from "./module-lifecycle.types.js"
import type { Module } from "../../module/module.js"
import type { ModuleRegistry } from "../module-registry/module-registry.provider.js"
import { Scope } from "../../../container/index.js"

// ModuleLifecycle
// ========================================

export class ModuleLifecycle {
    // State
    // ========================================
    #initialized = false
    #destroyed = false
    #claimed = false

    #committed = false
    #mounted = false

    #moduleHooks: ModuleHooks = {}
    #instances = new Set<ProviderLifecycle>()

    constructor(
        private readonly module: Module,
        private readonly registry: ModuleRegistry
    ) {}

    get initialized(): boolean {
        return this.#initialized
    }

    get claimed(): boolean {
        return this.#claimed
    }

    get mounted(): boolean {
        return this.#mounted
    }

    // Phases
    // ========================================

    init(hooks?: ModuleHooks): void {
        if (this.#initialized || this.#destroyed) return
        this.#moduleHooks = hooks ?? {}

        this.#runInitPhase()

        this.#initialized = true
    }

    mount(): void {
        if (!this.#initialized || this.#destroyed) return
        if (this.#committed) return

        this.registry.attach()
        this.#committed = true

        try {
            const parent = this.module.parent

            if (!parent || parent.mounted) {
                this.#mountTree()
            }
        } catch (error) {
            this.registry.detach()
            this.#committed = false

            throw error
        }
    }

    unmount(): void {
        if (!this.#initialized || this.#destroyed) return
        if (!this.#committed) return

        const errors: unknown[] = []

        this.#unmountTree(errors)

        if (errors.length > 0) {
            throw new AggregateError(errors, "Errors occurred while unmounting module subtree")
        }
    }

    async destroy(): Promise<void> {
        if (this.#destroyed) return

        const nodes = this.#claimSubtree()

        for (const node of nodes) {
            node.#destroyed = true
        }

        for (const node of nodes) {
            // eslint-disable-next-line no-await-in-loop
            await node.#runDestroyPhase()
        }
    }

    // Collection
    // ========================================

    #collectInstances(): void {
        const container = this.module.container
        const providers = this.module.providers

        // Observe every participating provider, lazy or not. Collection happens at construction, so the set
        // ends up in construction order — a dependency arrives before whatever injected it.
        for (const p of providers) {
            if (p.aliasOf || p.scope === Scope.Transient) continue
            container.onResolution(p.token, (instance) => {
                if (isLifecycleCandidate(instance)) this.#appendInstance(instance)
            })
        }

        for (const p of providers) {
            if (p.lazy || p.aliasOf || p.scope === Scope.Transient) continue
            container.resolve(p.token, false)
        }
    }

    #appendInstance(instance: ProviderLifecycle): void {
        if (this.#destroyed) return
        if (this.#instances.has(instance)) return
        this.#instances.add(instance)

        // Mid-init arrivals are reached by runInitPhase's live walk; only later ones catch up here.
        if (!this.#initialized) return

        instance.onModuleInit?.()
    }

    // Cascades
    // ========================================

    #mountTree(): void {
        if (this.#mounted) return

        this.#runMountPhase()
        this.#mounted = true

        for (const child of this.#children()) {
            child.#mountTree()
        }
    }

    #unmountTree(errors: unknown[]): void {
        if (!this.#mounted) return

        for (const child of [...this.#children()].reverse()) {
            child.#unmountTree(errors)
        }

        try {
            this.#runUnmountPhase(errors)
        } finally {
            this.#mounted = false
        }
    }

    /** Mark this subtree claimed and detach it, returning nodes in destroy order (children-first). Synchronous. */
    #claimSubtree(): ModuleLifecycle[] {
        if (this.#claimed) return []

        const nodes: ModuleLifecycle[] = []

        for (const child of [...this.#children()].reverse()) {
            nodes.push(...child.#claimSubtree())
        }

        this.#claimed = true
        this.registry.detach()

        this.#committed = false
        this.#mounted = false

        nodes.push(this)
        return nodes
    }

    #children(): ModuleLifecycle[] {
        const children: ModuleLifecycle[] = []
        for (const child of this.module.children) {
            const lifecycle = child.container.resolveSafe(ModuleLifecycle, false)
            if (lifecycle) children.push(lifecycle)
        }
        return children
    }

    // Phase runners
    // ========================================

    #runInitPhase(): void {
        this.#collectInstances()
        this.#moduleHooks.onModuleInit?.(this.module.container)
        for (const instance of this.#instances) {
            instance.onModuleInit?.()
        }
    }

    #runMountPhase(): void {
        this.#moduleHooks.onModuleMount?.(this.module.container)
        for (const instance of this.#instances) {
            instance.onModuleMount?.()
        }
    }

    #runUnmountPhase(errors: unknown[]): void {
        for (const instance of [...this.#instances].reverse()) {
            try {
                instance.onModuleUnmount?.()
            } catch (error) {
                errors.push(error)
            }
        }

        try {
            this.#moduleHooks.onModuleUnmount?.(this.module.container)
        } catch (error) {
            errors.push(error)
        }
    }

    async #runDestroyPhase(): Promise<void> {
        try {
            for (const instance of [...this.#instances].reverse()) {
                try {
                    // eslint-disable-next-line no-await-in-loop
                    await instance.onModuleDestroy?.()
                } catch (error) {
                    console.error("module.destroy", error)
                }
            }

            try {
                await this.#moduleHooks.onModuleDestroy?.(this.module.container)
            } catch (error) {
                console.error("module.destroy", error)
            }
        } finally {
            this.#instances.clear()
            this.#moduleHooks = {}
        }
    }
}

// Helpers
// ========================================

function isLifecycleCandidate(value: unknown): value is ProviderLifecycle {
    if (!value || typeof value !== "object") return false

    const candidate = value as ProviderLifecycle
    return Boolean(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        candidate.onModuleInit || candidate.onModuleMount || candidate.onModuleUnmount || candidate.onModuleDestroy
    )
}
