import type { DependencyContainer, InjectionToken } from "../../../aliases/index.js"
import type { ModuleHooks, ProviderLifecycle } from "./module-lifecycle.types.js"
import type { Provider } from "../providers.types.js"
import { getProviderToken } from "../getProviderToken.js"
import { AsyncTeardown } from "../async-teardown/async-teardown.provider.js"
import type { ModuleMetadata } from "../module-metadata/module-metadata.provider.js"
import type { ModuleRegistry } from "../module-registry/module-registry.provider.js"

type TreeHook = "onModuleMount" | "onModuleUnmount" | "onModuleDestroy"

// teardownRoots (pure helper)
// ========================================

/**
 * Of a set of pending nodes, return those whose parent is NOT also pending. Tearing down only the
 * roots — each recursing its own subtree — yields full-reverse ordering no matter what order the
 * cleanups arrived in. Pure and container-free; the flush wires it to the real tree, tests wire it to
 * plain objects.
 *
 * Exported for direct unit tests only — not public API. It is unreachable through the package exports
 * map (no barrel re-exports it), so the sole runtime consumer is the flush below.
 */
export function teardownRoots<T>(pending: ReadonlySet<T>, getParent: (node: T) => T | null): T[] {
    const roots: T[] = []
    for (const node of pending) {
        const parent = getParent(node)
        if (!parent || !pending.has(parent)) {
            roots.push(node)
        }
    }
    return roots
}

// ModuleLifecycle
// ========================================

/**
 * Orchestrator for one module's lifecycle, modeled as a state machine:
 *
 *     created → initialized → committed → mounted → (pendingTeardown ⇄ resurrection) → destroyed
 *
 * The class is the sole owner of every phase invocation (INIT / MOUNT / UNMOUNT / DESTROY). It receives
 * three signals from React (via `useModule`) and decides the order itself; React's own effect/cleanup
 * order is treated as untrusted input.
 *
 * Signals (the entire external surface):
 *   - `init(hooks?)`  — render path, after registration. Resolves the module's provider-lifecycle
 *                       instances and runs the INIT phase. INIT errors propagate (the caller disposes
 *                       the container); every other phase isolates its errors.
 *   - `commit()`      — effect setup. Cancels any pending teardown (resurrection), attaches into the
 *                       tree, and mounts iff this node is a root or its parent is already mounted.
 *   - `scheduleTeardown()` — effect cleanup. Never destroys synchronously; enqueues a deferred flush.
 *
 * Ordering guarantees, provided by the tree rather than by React:
 *   - MOUNT   is parent-first, siblings in commit order (P → C1 → C2). The commit gate (`mountTree`
 *             requires `committed`) makes this independent of whether the parent or the child commits
 *             first: a child that commits early waits for the parent's cascade; a parent that commits
 *             early skips uncommitted children, which then self-mount on their own commit.
 *   - TEARDOWN is full reverse (C2 → C1 → P). Cleanups are batched into a single microtask flush that
 *             computes the teardown roots and recurses children-reverse-first, so disposal never runs
 *             inside a synchronous React cleanup.
 *
 * Idempotency principle: every signal is safe to send at any time and in any multiplicity. Double
 * commit, repeat teardown, and resurrection all collapse cleanly, and a signal that arrives before
 * `init()` (or a second `init()`) is a silent no-op — order emerges from the state machine, not from
 * the caller.
 */
export class ModuleLifecycle {
    // State
    // ========================================
    // `initialized` is the orchestrator's own flag; the committed/mounted/pendingTeardown flags live on
    // ModuleMetadata (its public data contract) and are mutated only here.
    private initialized = false
    private moduleHooks: ModuleHooks = {}
    private providerHooks: ProviderLifecycle[] = []

    // Deferred teardown flush — module-scope state, held statically so the flush can reach into
    // instances' private members (a class-static has access to any instance of its own class).
    private static readonly pending = new Set<ModuleLifecycle>()
    private static flushScheduled = false

    constructor(
        private readonly metadata: ModuleMetadata,
        private readonly registry: ModuleRegistry
    ) {}

    // Signals
    // ========================================

    /**
     * Enter the `initialized` state. Eagerly resolves the provider-lifecycle instances from the
     * `metadata.providers` snapshot (skipping `useExisting` aliases), stores the module hooks, and runs
     * the INIT phase (module hook first, then instances FIFO). INIT errors propagate so the caller can
     * dispose the container. A second `init()` is a silent no-op: the phase never runs twice.
     */
    init(hooks?: ModuleHooks): void {
        if (this.initialized) return
        this.initialized = true
        this.moduleHooks = hooks ?? {}

        const tokens = collectLifecycleTokens(this.metadata.providers)
        this.providerHooks = resolveProviderLifecycles(this.metadata.container, tokens)

        this.runInitPhase()
    }

    /**
     * React "subtree committed" signal. Idempotent. First cancels a pending teardown (resurrection),
     * then — on the first commit — attaches into the tree and either mounts now (root, or parent
     * already mounted) or waits for the parent's mount cascade. A no-op before `init()`.
     */
    commit(): void {
        if (!this.initialized) return

        if (this.metadata.pendingTeardown) {
            this.metadata.pendingTeardown = false
            ModuleLifecycle.pending.delete(this)
        }

        if (this.metadata.committed) return
        this.metadata.committed = true

        this.registry.attach()

        const parent = this.registry.parentMetadata()
        if (!parent || parent.mounted) {
            this.mountTree()
        }
        // else: parent not yet mounted — its mountTree cascade will reach us.
    }

    /**
     * React "subtree unmounting" signal. Never tears down synchronously: flags the node, adds it to the
     * module-scope pending set, and schedules one microtask flush per burst. A no-op before `init()` or
     * when already pending.
     */
    scheduleTeardown(): void {
        if (!this.initialized) return
        if (this.metadata.pendingTeardown) return

        this.metadata.pendingTeardown = true
        ModuleLifecycle.pending.add(this)
        ModuleLifecycle.scheduleFlush()
    }

    // Mount cascade
    // ========================================

    /** Mount this node, then cascade to children in commit order. Parent-first; guarded by the commit gate. */
    private mountTree(): void {
        if (!this.metadata.committed || this.metadata.mounted) return

        this.runMountPhase()
        this.metadata.mounted = true

        for (const child of this.childLifecycles()) {
            child.mountTree()
        }
    }

    // Teardown cascade
    // ========================================

    /**
     * Tear this subtree down, children in reverse commit order then this node: unmount → async teardown
     * → destroy → dispose → detach. Idempotent / repeat-safe.
     *
     * Public only because the test suite drives teardown through it directly; it is otherwise reached
     * solely from the flush and from the parent recursion (both class-scoped).
     */
    async unmountTree(): Promise<void> {
        if (!this.metadata.mounted) {
            // Not mounted, but possibly a committed-but-never-mounted pending leaf — clear its state.
            this.finalizeTeardown()
            return
        }

        const children = [...this.childLifecycles()].reverse()
        for (const child of children) {
            // eslint-disable-next-line no-await-in-loop
            await child.unmountTree()
        }

        this.runUnmountPhase()

        // Suspend only when there is genuinely async work: an AsyncTeardown to run, or a container whose
        // dispose returns a promise. Introducing extra await points here would shift teardown timing
        // relative to concurrent rebuild/unmount bursts.
        const container = this.metadata.container
        try {
            if (container.isRegistered(AsyncTeardown, false)) {
                await container.resolve(AsyncTeardown).run()
            }
        } catch (error) {
            console.error("module.asyncTeardown", error)
        }

        this.runDestroyPhase()

        this.metadata.mounted = false

        try {
            const result = container.dispose()
            if (result instanceof Promise) {
                await result
            }
        } catch (error) {
            console.error("module.dispose", error)
        }

        this.finalizeTeardown()
    }

    /** Clear pending state and remove this node from its parent's children set. Idempotent. */
    private finalizeTeardown(): void {
        this.metadata.pendingTeardown = false
        ModuleLifecycle.pending.delete(this)
        this.registry.detach()
    }

    // Phases
    // ========================================
    // Each phase = module hook + provider instances. INIT/MOUNT run module-first then instances FIFO;
    // UNMOUNT/DESTROY run instances LIFO then module. INIT errors propagate; all other phases isolate
    // each callback's error (console.error, never rethrow) so one bad hook cannot break the cascade.

    private runInitPhase(): void {
        try {
            this.moduleHooks.onModuleInit?.(this.metadata.container)
        } catch (error) {
            console.error("module.onModuleInit", error)
            throw error
        }

        for (const instance of this.providerHooks) {
            try {
                instance.onModuleInit?.()
            } catch (error) {
                console.error("provider.onModuleInit", error)
                throw error
            }
        }
    }

    private runMountPhase(): void {
        this.invokeModuleHook("onModuleMount")
        this.invokeProviderHooks("onModuleMount")
    }

    private runUnmountPhase(): void {
        this.invokeProviderHooks("onModuleUnmount", true)
        this.invokeModuleHook("onModuleUnmount")
    }

    private runDestroyPhase(): void {
        this.invokeProviderHooks("onModuleDestroy", true)
        this.invokeModuleHook("onModuleDestroy")
    }

    private invokeModuleHook(hook: TreeHook): void {
        try {
            this.moduleHooks[hook]?.(this.metadata.container)
        } catch (error) {
            console.error(`module.${hook}`, error)
        }
    }

    private invokeProviderHooks(hook: TreeHook, reverse = false): void {
        if (!this.providerHooks.length) return

        const ordered = reverse ? [...this.providerHooks].reverse() : this.providerHooks
        for (const instance of ordered) {
            try {
                instance[hook]?.()
            } catch (error) {
                console.error(`provider.${hook}`, error)
            }
        }
    }

    // Tree navigation
    // ========================================

    /** The lifecycle parent's orchestrator, or null at a root. */
    private parentLifecycle(): ModuleLifecycle | null {
        return resolveLifecycle(this.metadata.parent)
    }

    /** This node's child orchestrators, in insertion (commit) order. */
    private *childLifecycles(): IterableIterator<ModuleLifecycle> {
        for (const container of this.metadata.children) {
            const child = resolveLifecycle(container)
            if (child) yield child
        }
    }

    // Flush machinery (module-scope, static)
    // ========================================

    private static scheduleFlush(): void {
        if (ModuleLifecycle.flushScheduled) return
        ModuleLifecycle.flushScheduled = true
        queueMicrotask(() => {
            void ModuleLifecycle.flush()
        })
    }

    private static async flush(): Promise<void> {
        ModuleLifecycle.flushScheduled = false

        const roots = teardownRoots(ModuleLifecycle.pending, (node) => node.parentLifecycle())
        for (const root of roots) {
            // eslint-disable-next-line no-await-in-loop
            await root.unmountTree()
        }

        // A node can be scheduled again during the async flush; drain it on the next burst.
        if (ModuleLifecycle.pending.size > 0) ModuleLifecycle.scheduleFlush()
    }
}

// Eager provider-lifecycle resolution (init-time)
// ========================================

function collectLifecycleTokens(providers: readonly Provider[]): InjectionToken<any>[] {
    const tokens: InjectionToken<any>[] = []
    for (const provider of providers) {
        if (isUseExistingProvider(provider)) continue
        tokens.push(getProviderToken(provider))
    }
    return tokens
}

function resolveProviderLifecycles(container: DependencyContainer, tokens: InjectionToken<any>[]): ProviderLifecycle[] {
    const instances: ProviderLifecycle[] = []

    const totalCounts = countTokenOccurrences(tokens)
    const seenCounts = new Map<InjectionToken<any>, number>()
    const resolveAllCache = new Map<InjectionToken<any>, unknown[]>()

    for (const token of tokens) {
        const resolved = resolveByOccurrence(container, token, totalCounts, seenCounts, resolveAllCache)
        if (isLifecycleCandidate(resolved)) {
            instances.push(resolved)
        }
    }

    return instances
}

/**
 * Resolve the instance for one token occurrence. A token used once resolves directly; a repeated token
 * uses a single `resolveAll` (cached) and maps each occurrence to the instance at its own index, so N
 * registrations of a token line up with N declarations in order.
 */
function resolveByOccurrence(
    container: DependencyContainer,
    token: InjectionToken<any>,
    totalCounts: Map<InjectionToken<any>, number>,
    seenCounts: Map<InjectionToken<any>, number>,
    resolveAllCache: Map<InjectionToken<any>, unknown[]>
): unknown {
    const seen = seenCounts.get(token) ?? 0
    seenCounts.set(token, seen + 1)

    const total = totalCounts.get(token) ?? 0
    if (total > 1) {
        let resolvedAll = resolveAllCache.get(token)
        if (!resolvedAll) {
            resolvedAll = container.resolveAll(token)
            resolveAllCache.set(token, resolvedAll)
        }
        return seen < resolvedAll.length ? resolvedAll.at(seen) : resolvedAll.at(-1)
    }

    return container.resolve(token)
}

function countTokenOccurrences(tokens: InjectionToken<any>[]): Map<InjectionToken<any>, number> {
    const counts = new Map<InjectionToken<any>, number>()
    for (const token of tokens) {
        counts.set(token, (counts.get(token) ?? 0) + 1)
    }
    return counts
}

function isUseExistingProvider(provider: Provider): boolean {
    return typeof provider !== "function" && "useExisting" in provider
}

function isLifecycleCandidate(value: unknown): value is ProviderLifecycle {
    if (!value || typeof value !== "object") return false

    const candidate = value as ProviderLifecycle
    return Boolean(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        candidate.onModuleInit || candidate.onModuleMount || candidate.onModuleUnmount || candidate.onModuleDestroy
    )
}

// Tree resolution helpers
// ========================================

/**
 * Resolve the orchestrator registered directly on a container, or null when it is not a module container.
 * Every module has its own container and registers its own orchestrator on it, so there is no chain to
 * walk: a hit here IS that container's module, and a miss means there is no module at that level.
 */
function resolveLifecycle(container: DependencyContainer | null): ModuleLifecycle | null {
    if (!container) return null
    try {
        if (!container.isRegistered(ModuleLifecycle, false)) return null
        return container.resolve(ModuleLifecycle)
    } catch {
        return null
    }
}
