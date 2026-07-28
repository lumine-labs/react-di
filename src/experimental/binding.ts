import type { Dispatch, SetStateAction } from "react"

import type { AbstractComponent } from "./AbstractComponent.js"

// Runtime binding — the seam between the class instance and its React render fiber.
// ========================================
//
// The instance owns the state API (`this.state`, `this.setState`); React owns the storage and scheduling.
// This record is the privileged, non-public channel: `setState` (a method on the class) and the Render
// bridge (in the fiber) reach the same cell without widening the instance's public shape. Keyed by
// instance in a WeakMap — no `__`-prefixed public methods on the user-facing surface.

export type BindingPhase = "premount" | "mounted" | "unmounted"

export type ComponentRuntime<S extends object = object> = {
    // premount: before the first Render bind (constructor / field-init window) — setState throws.
    // mounted:  bound to React's setter — setState schedules.
    // unmounted: unbound on cleanup — setState throws.
    phase: BindingPhase
    setReactState: Dispatch<SetStateAction<S>> | null
}

const runtimes = new WeakMap<object, ComponentRuntime>()

export function getRuntime(instance: object): ComponentRuntime {
    let runtime = runtimes.get(instance)
    if (!runtime) {
        runtime = { phase: "premount", setReactState: null }
        runtimes.set(instance, runtime)
    }
    return runtime
}

// Framework-only. Assigns the render snapshot (props + state, both public readonly fields) and arms the
// React setter — called in the Render body, immediately before rendering `instance.Component`.
export function bindRenderState<P, S extends object>(
    instance: AbstractComponent<P, S>,
    props: Readonly<P>,
    state: Readonly<S>,
    setReactState: Dispatch<SetStateAction<S>>
): void {
    const writable = instance as { props: Readonly<P>; state: Readonly<S> }
    writable.props = props
    writable.state = state

    const runtime = getRuntime(instance)
    runtime.phase = "mounted"
    runtime.setReactState = setReactState as Dispatch<SetStateAction<object>>
}

// Framework-only. Detaches the setter on unmount so a stale instance cannot schedule into a dead tree.
export function unbindRenderState(instance: object): void {
    const runtime = getRuntime(instance)
    runtime.phase = "unmounted"
    runtime.setReactState = null
}

// The React useState initializer: the subclass's `state = {…}` field, or `{}` when it declared none.
export function getInitialState<S extends object>(instance: AbstractComponent<unknown, S>): S {
    return instance.state ?? ({} as S)
}
