import { shallowEqual } from "@luminelabs/toolkit"

// Types
// ========================================

export type PropsAdapter<P extends object, T = P> = {
    create(initial: P): T
    update(args: { current: T; next: P }): T
}

type Subscriber<T> = (next: T, prev: T) => void

// The default adapter is a plain rewrite: `create`/`update` pass the raw props straight through, so
// `current` is always the latest props object. There is always an adapter — supplying none just uses
// this one — which keeps the class free of "adapter vs no-adapter" branching. Custom adapters (MobX,
// effector) wrap the props on `create` and can mutate-and-return a stable instance from `update`.
const defaultAdapter: PropsAdapter<any> = {
    create(initial) {
        return initial
    },
    update({ next }) {
        return next
    },
}

// PropsRef
// ========================================

// Component-owned props bridge. Created once per component by `usePropsRef`, which also returns the
// `ValueProvider` literal that registers this instance — the class itself carries no DI plumbing and
// doubles as the default injection token (Resolver/ModuleMetadata pattern), so nested modules shadow
// naturally.
//
// Because the instance lives with the component, not the module resolution, it SURVIVES rebuilds: the
// rebuilt container re-registers the same instance (stable adapter output across rebuilds).
// Consequence: subscriptions can outlive a rebuilt-away service — services must store the `off()`
// returned by `onUpdate` and call it in `onModuleDestroy`.
export class PropsRef<T = any> {
    private value: T // exposed value: the adapter's output (the raw props under the default adapter)
    private plain: object // raw props, kept untouched so a swapped adapter always wraps the source
    private adapter: PropsAdapter<any, T>
    private readonly subscribers = new Set<Subscriber<T>>()

    // There is deliberately no `onCreate` hook: the instance exists before any subscriber can exist, so
    // construction itself is the "create" moment — `current` in a service constructor is the create
    // payload.
    constructor(config: { props: object; adapter?: PropsAdapter<any, T> }) {
        this.adapter = config.adapter ?? defaultAdapter
        this.plain = config.props
        this.value = this.adapter.create(config.props)
    }

    // Current value. Under the default adapter it's the latest props object (replaced each update); under
    // a custom adapter it's that adapter's `create()` output — a mutate-and-return adapter keeps a stable
    // reference (e.g. a MobX observable) across updates, a rewrite adapter yields a fresh object.
    get current(): T {
        return this.value
    }

    // Apply fresh props. Gated by shallow-equality against the last applied props — a no-op when equal,
    // which makes per-render calls (the `usePropsRef` layout effect) cheap and keeps subscribers quiet
    // when nothing changed. On real change the adapter's `update({ current, next })` returns the new
    // value: a rewrite adapter returns `next`, a mutate adapter mutates `current` and returns it. Then
    // fires subscribers with `(next, prev)`.
    update(next: object): void {
        if (shallowEqual(this.plain, next)) return
        this.plain = next

        const prev = this.value
        this.value = this.adapter.update({ current: this.value, next })

        this.notify(this.value, prev)
    }

    // Swap the adapter (a hook dependency — see `usePropsRef`). Rebuilds the exposed value from the raw
    // props `this.plain`, never from the previous adapter's output — running `plain` (not `value`) is
    // what makes swaps correct in every direction: mobx -> none yields unwrapped props, mobx -> effector
    // wraps the source rather than a stale observable. Fires subscribers so consumers see the new output.
    /** @internal */
    setAdapter(adapter?: PropsAdapter<any, T>): void {
        const nextAdapter = adapter ?? defaultAdapter
        if (nextAdapter === this.adapter) return
        this.adapter = nextAdapter

        const prev = this.value
        this.value = nextAdapter.create(this.plain)

        this.notify(this.value, prev)
    }

    // Subscribe to changes; returns an unsubscribe. `immediate: true` invokes the callback synchronously
    // at subscription time with `(current, current)`.
    onUpdate(cb: Subscriber<T>, options?: { immediate?: boolean }): () => void {
        this.subscribers.add(cb)

        if (options?.immediate) {
            invokeSubscriber(cb, this.value, this.value)
        }

        return () => {
            this.subscribers.delete(cb)
        }
    }

    // Each subscriber is isolated: one throwing callback cannot break the pass or the others.
    private notify(next: T, prev: T): void {
        for (const cb of this.subscribers) {
            invokeSubscriber(cb, next, prev)
        }
    }
}

// Helpers
// ========================================

function invokeSubscriber<T>(cb: Subscriber<T>, next: T, prev: T): void {
    try {
        cb(next, prev)
    } catch (error) {
        console.error("PropsRef.onUpdate: subscriber threw", error)
    }
}
