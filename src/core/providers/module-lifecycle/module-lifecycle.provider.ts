import type { ModuleHooks, ProviderLifecycle } from "./module-lifecycle.types.js"
import type { Module, ProviderSnapshot } from "../../module/module.js"
import type { ModuleRegistry } from "../module-registry/module-registry.provider.js"
import { Scope, type InjectionToken } from "../../../container/index.js"

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

    /** Arm adoption, then build. Listeners must be live before anything constructs, or the eager pass is unseen. */
    #collectInstances(): void {
        const groups = groupByToken(this.module.providers)

        this.#observeOwnedInstances(groups)
        this.#resolveEagerGroups(groups)
    }

    /** Long-lived: these listeners outlive init and catch late arrivals too. */
    #observeOwnedInstances(groups: readonly ProviderGroup[]): void {
        for (const group of groups) {
            if (!group.bound) continue

            // Singleton SCOPE, not resolution count: a lazy binding and a collection member are singletons
            // like any other, so `lazy` moves when this fires, never whether it is attached. Deciding per
            // binding is what keeps "transients never participate in lifecycle" true inside a collection.
            this.module.container.onPredicateResolution(
                group.token,
                (instance) => {
                    if (isLifecycleCandidate(instance)) this.#appendInstance(instance)
                },
                (entry) => entry.scope === Scope.Singleton
            )
        }
    }

    /** Construction order becomes adoption order, so a dependency arrives before whatever injected it. */
    #resolveEagerGroups(groups: readonly ProviderGroup[]): void {
        const container = this.module.container

        for (const group of groups) {
            if (!group.eager) continue

            if (group.multi) {
                container.resolveAll(group.token, "self")
            } else {
                container.resolve(group.token, "self")
            }
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
            const lifecycle = child.container.resolveOptional(ModuleLifecycle, "self")
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

/** One token's worth of declared providers — a multi token has several, behind one binding list. */
type ProviderGroup = {
    token: InjectionToken<unknown>
    multi: boolean
    /** Gates observation: a group of nothing but aliases binds nothing here to watch. */
    bound: boolean
    /** Gates the eager pass: something here is retained, and nothing deferred the group. */
    eager: boolean
}

/** `retains` and `lazy` accumulate across members; `eager` is the verdict once every member has been seen. */
type GroupDraft = Omit<ProviderGroup, "eager"> & { retains: boolean; lazy: boolean }

/** First-appearance order, which is registration order, which is the order a collection resolves in. */
function groupByToken(providers: readonly ProviderSnapshot[]): ProviderGroup[] {
    const drafts = new Map<InjectionToken<unknown>, GroupDraft>()

    for (const p of providers) {
        const bound = !p.aliasOf
        const retains = bound && (p.scope ?? Scope.Singleton) === Scope.Singleton
        const draft = drafts.get(p.token)

        if (draft) {
            draft.bound ||= bound
            draft.retains ||= retains
            draft.lazy ||= p.lazy === true
            continue
        }

        drafts.set(p.token, { token: p.token, multi: p.multi === true, bound, retains, lazy: p.lazy === true })
    }

    // Laziness comes from whichever members declare it, never from the first entry — a value member
    // declared ahead of a lazy class says nothing, and must not drag the group into the eager pass.
    return [...drafts.values()].map(({ token, multi, bound, retains, lazy }) => ({
        token,
        multi,
        bound,
        eager: retains && !lazy,
    }))
}

function isLifecycleCandidate(value: unknown): value is ProviderLifecycle {
    if (!value || typeof value !== "object") return false

    const candidate = value as ProviderLifecycle
    return Boolean(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        candidate.onModuleInit || candidate.onModuleMount || candidate.onModuleUnmount || candidate.onModuleDestroy
    )
}
