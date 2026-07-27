import type { ModuleHooks, ModulePhase, ProviderLifecycle } from "./module-lifecycle.types.js"
import { ModuleMetadata } from "../module-metadata/module-metadata.provider.js"
import type { ModuleRegistry } from "../module-registry/module-registry.provider.js"
import { type Container, Scope } from "../../../container"

// ModuleLifecycle
// ========================================

export class ModuleLifecycle {
    // State
    // ========================================
    #initialized = false
    #destroyed = false
    #moduleHooks: ModuleHooks = {}
    #instances = new Set<ProviderLifecycle>()

    constructor(
        private readonly metadata: ModuleMetadata,
        private readonly registry: ModuleRegistry
    ) {}

    // Phases
    // ========================================

    init(hooks?: ModuleHooks): void {
        if (this.#initialized || this.#destroyed) return
        this.#moduleHooks = hooks ?? {}

        this.#collectInstances()
        this.#runInitPhase()

        this.#initialized = true
    }

    mount(): void {
        if (!this.#initialized || this.#destroyed) return
        if (this.metadata.committed) return
        this.metadata.committed = true

        this.registry.attach()

        const parent = this.metadata.parent?.resolveSafe(ModuleMetadata, false)
        if (!parent || parent.mounted) {
            this.#mountTree()
        }
    }

    unmount(): void {
        if (!this.#initialized || this.#destroyed) return

        for (const child of [...this.#children()].reverse()) {
            child.unmount()
        }

        if (!this.metadata.mounted) return

        this.#runUnmountPhase()
        this.metadata.mounted = false
    }

    async destroy(): Promise<void> {
        if (this.#destroyed) return

        const nodes = this.#claimSubtree()

        for (const node of nodes) {
            // eslint-disable-next-line no-await-in-loop
            await node.#runDestroyPhase()
        }
    }

    // Collection
    // ========================================

    #collectInstances(): void {
        const container = this.metadata.container
        const providers = this.metadata.providers

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

        try {
            instance.onModuleInit?.()
        } catch (error) {
            this.#reportError("init", error)
        }
    }

    // Cascades
    // ========================================

    #mountTree(): void {
        if (!this.metadata.committed || this.metadata.mounted) return

        this.#runMountPhase()
        this.metadata.mounted = true

        for (const child of this.#children()) {
            child.#mountTree()
        }
    }

    /** Mark this subtree destroyed and detach it, returning nodes in destroy order. Synchronous. */
    #claimSubtree(): ModuleLifecycle[] {
        const nodes: ModuleLifecycle[] = []

        for (const child of [...this.#children()].reverse()) {
            nodes.push(...child.#claimSubtree())
        }

        this.#destroyed = true
        this.registry.detach()
        nodes.push(this)

        return nodes
    }

    #children(): ModuleLifecycle[] {
        const children: ModuleLifecycle[] = []
        for (const container of this.metadata.children) {
            const child = resolveLifecycle(container)
            if (child) children.push(child)
        }
        return children
    }

    // Phase runners
    // ========================================

    /** One try for the whole phase: a failure here means a half-built module, so the rest is skipped. */
    #runInitPhase(): void {
        try {
            this.#moduleHooks.onModuleInit?.(this.metadata.container)
            for (const instance of this.#instances) {
                instance.onModuleInit?.()
            }
        } catch (error) {
            this.#reportError("init", error)
        }
    }

    #runMountPhase(): void {
        try {
            this.#moduleHooks.onModuleMount?.(this.metadata.container)
        } catch (error) {
            this.#reportError("mount", error)
        }

        for (const instance of this.#instances) {
            try {
                instance.onModuleMount?.()
            } catch (error) {
                this.#reportError("mount", error)
            }
        }
    }

    #runUnmountPhase(): void {
        for (const instance of [...this.#instances].reverse()) {
            try {
                instance.onModuleUnmount?.()
            } catch (error) {
                this.#reportError("unmount", error)
            }
        }

        try {
            this.#moduleHooks.onModuleUnmount?.(this.metadata.container)
        } catch (error) {
            this.#reportError("unmount", error)
        }
    }

    async #runDestroyPhase(): Promise<void> {
        for (const instance of [...this.#instances].reverse()) {
            try {
                // eslint-disable-next-line no-await-in-loop
                await instance.onModuleDestroy?.()
            } catch (error) {
                this.#reportError("destroy", error)
            }
        }

        try {
            await this.#moduleHooks.onModuleDestroy?.(this.metadata.container)
        } catch (error) {
            this.#reportError("destroy", error)
        }
    }

    /**
     * A declared `onModuleError` takes ownership: it is called and the error goes no further, so the phase
     * carries on with the remaining hooks. Without one the default differs by phase — the first three throw
     * into a React render or effect, which surfaces them, while destroy is awaited by nobody and would only
     * produce an unhandled rejection, so it is logged instead.
     */
    #reportError(phase: ModulePhase, error: unknown): void {
        const handler = this.#moduleHooks.onModuleError
        if (handler) {
            handler(phase, error)
            return
        }

        if (phase === "destroy") {
            console.error(`module.${phase}`, error)
            return
        }

        throw error
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

function resolveLifecycle(container: Container | null): ModuleLifecycle | null {
    if (!container) return null
    return container.resolveSafe(ModuleLifecycle, false) ?? null
}
