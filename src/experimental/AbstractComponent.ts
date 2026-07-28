import type { ComponentType } from "react"

import { getRuntime } from "./binding.js"

// AbstractComponent
// ========================================
//
// The base every hybrid component extends. It is NEVER a React.Component — React never instantiates or
// renders it as one; `Component` (a field holding a real React component) is what React renders. `props`
// and `state` are the JSX attribute-typing mechanism and the instance state snapshot; the runtime assigns
// both (via the binding module) before each render. See agent-notes/design/handoff-class-component.md and
// handoff-state-setstate.md — the authoritative specs.

/** setState accepts a partial patch or a functional updater; both MERGE into current state. */
export type StateUpdate<S> = Partial<S> | ((state: Readonly<S>) => Partial<S>)

export abstract class AbstractComponent<P = {}, S extends object = {}> {
    // Assigned by the runtime before each render — the snapshot for THIS render attempt. `!` because the
    // framework sets them, not the constructor. Treat both as readonly snapshots; write state via setState.
    props!: Readonly<P>
    state!: Readonly<S>

    // Phantom members — JSX-assignability appeasement. `JSX.ElementClass` is `extends React.Component<any>`
    // plus `render(): ReactNode`; an instance must be structurally assignable to React.Component. `props`,
    // `state` and `setState` are REAL and satisfy their slots; these are the leftovers React demands, typed
    // `never`: assignable to every signature React asks for, yet unusable (`this.render()` /
    // `this.forceUpdate()` → "Type 'never' has no call signatures"). `render` is a phantom precisely because
    // the real render path is the `Component` field, not a method. react18 also requires `refs`; react19
    // dropped it — declaring it satisfies both. `declare` emits nothing; none exist at runtime.
    declare readonly render: never
    declare readonly context: never
    declare readonly forceUpdate: never
    declare readonly refs: never

    // React-canonical state: the update is delegated straight to React's setter, merged inside the
    // functional update. Batching, transitions and priority are React's.
    //
    // NOTE ON VISIBILITY: the handoff RECOMMENDS `protected setState`, but it must be PUBLIC here. The
    // decorator's `T & FC<PropsOf<T>>` typing routes `<X … />` through JSX's class-element branch, which
    // requires the instance to be structurally assignable to `React.Component<any>` — whose `setState` is
    // public. A `protected setState` fails that check (TS2786: "protected in Child but public in
    // Component"), breaking both the `@Component()` decorator typing and JSX usage. Public it is; prefer
    // exposing domain methods over calling `instance.setState(...)` from outside by convention.
    setState(update: StateUpdate<S>): void {
        const runtime = getRuntime(this)

        if (runtime.phase === "premount") {
            throw new Error("Cannot call setState() before the component is mounted.")
        }
        if (runtime.phase === "unmounted") {
            throw new Error("Cannot call setState() after the component has been disposed.")
        }

        runtime.setReactState!((current) => ({
            ...current,
            ...(typeof update === "function" ? update(current as Readonly<S>) : update),
        }))
    }

    // Object lifecycle — the ONE lifecycle family. The instance is a REGISTERED PROVIDER in its own module
    // (see component.tsx), so the existing ModuleLifecycle adopts it and delivers these: onModuleInit →
    // onModuleMount (forward), and onModuleUnmount → onModuleDestroy (LIFO) on unmount, ordered against the
    // scope's other providers. Optional and duck-typed — implement only what you need. React-timed needs
    // (paint, subscriptions keyed to render) go in `useEffect` inside `Component`, not here.
    //
    // setState timing: onModuleInit runs during the module's render-phase init, BEFORE the state bridge is
    // bound → setState there THROWS (before-mount). onModuleMount runs as a passive effect after commit,
    // AFTER the bind → setState there WORKS.
    onModuleInit?(): void
    onModuleMount?(): void
    onModuleUnmount?(): void
    onModuleDestroy?(): void | Promise<void>

    // The rendered leaf — a field holding a real React component (`Component = () => …`, or a userland-
    // wrapped `observer(() => …)` / `memo(() => …)`). Hooks are legal in its body; it runs as its own
    // function-component fiber. Typed `ComponentType` so both plain arrows and exotic wrapped components
    // are assignable. `readonly` discourages reassignment (swapping it remounts the subtree).
    abstract readonly Component: ComponentType
}
