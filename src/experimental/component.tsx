import { memo, useEffect, useState } from "react"
import type { FC, ReactNode } from "react"

import type { Provider } from "../container/index.js"
import { useModule } from "../react/hooks/useModuleContext.js"
import { useResolve } from "../react/hooks/useResolve.js"
import { ModuleProvider } from "../react/providers/ModuleProvider.js"
import type { AbstractComponent } from "./AbstractComponent.js"
import { bindRenderState, getInitialState, unbindRenderState } from "./binding.js"

// Public types
// ========================================

/** A class extending AbstractComponent, with any constructor-injected dependencies. */
export type ComponentClass<P = any> = new (...args: any[]) => AbstractComponent<P, any>

/** Extract the props type P from a component class's `AbstractComponent<P, …>` base. */
export type PropsOf<T> = T extends new (...args: any[]) => AbstractComponent<infer P, any> ? P : never

export type ComponentOptions<P = {}> = {
    /**
     * Component-scoped providers, registered in the component's OWN module alongside the component instance
     * itself. They get full onModule* lifecycle and LIFO disposal, are resolvable by the instance's
     * constructor and by the component's children, and are NOT registered in the parent container.
     */
    providers?: Provider[]
    /**
     * Wrap the PUBLIC wrapper in `React.memo` (plain shallow comparison, never the leaf). A parent re-render
     * with shallow-equal props then bails out, while native hook / state / context updates inside the leaf
     * continue normally. No custom comparator is needed for `rebuildOn` — ModuleProvider diffs the dep array
     * elementwise, so the array's identity across renders is irrelevant.
     */
    memo?: boolean
    /**
     * Rebuild policy, owned by the class. A selector from the CURRENT render's props to a dependency array;
     * when a dependency's value changes (`Object.is`, elementwise — ModuleProvider's semantics), the
     * component's module rebuilds → a fresh instance with class-field initial state. The `@Component<Props>`
     * type anchor types `props` here and is checked against the decorated class's own `P`.
     *
     * The selector MUST be pure: it runs on EVERY render. Derive only from props; no side effects.
     */
    rebuildOn?: (props: Readonly<P>) => readonly unknown[]
}

/**
 * The `Component` decorator's result. Works BOTH as a legacy class decorator (`@Component(...)`) and as an
 * expression (`Component(...)(Impl)`) — the same function.
 *
 * Typed as `T & FC<PropsOf<T>>` — near-identity: the class type T is preserved (so the `@`-application stays
 * legal and attribute checking runs against the instance's `props`) and intersected with `FC<P>` to add a
 * call signature. `AbstractComponent` is made structurally assignable to `JSX.ElementClass` via real
 * `props`/`state`/`setState` plus `never`-typed phantom members; the `FC<P>` half lets JSX also satisfy
 * `JSXElementConstructor` through its FUNCTION-component branch, bypassing the class branch's arity cap so a
 * component with 3+ constructor DI deps still types. It also keeps the value a `ComponentType` for interop.
 *
 * The `P` parameter carries the `@Component<Props>` anchor: `T extends ComponentClass<P>` makes a class whose
 * `AbstractComponent<P'>` disagrees with the option's `P` fail to compile.
 */
export type ComponentDecorator<P = any> = <T extends ComponentClass<P>>(cls: T) => T & FC<PropsOf<T>>

// Component
// ========================================

export function Component<P = {}>(options?: ComponentOptions<P>): ComponentDecorator<P> {
    return ((cls: ComponentClass) => build(cls, options)) as unknown as ComponentDecorator<P>
}

// Pipeline
// ========================================

// A reserved prop: the React state value, forwarded to the leaf so a userland-wrapped (memo/observer) leaf
// re-renders on setState (its identity changes) yet still skips a pure parent cascade (props + state both
// shallow-equal). The leaf reads `this.state`; this prop exists only to feed the wrapper's comparison.
const STATE_PROP = "__state"

function build(target: ComponentClass, options?: ComponentOptions<any>): FC<any> {
    // Every @Component owns a REAL module, and the instance is a singleton provider in it — so the existing
    // ModuleLifecycle adopts it (onModuleInit/Mount/Unmount/Destroy) with zero lifecycle code here. Built
    // ONCE, so the providers array has a stable identity across renders.
    const providers: Provider[] = [...(options?.providers ?? []), { provide: target, useClass: target }]
    const rebuildSelector = options?.rebuildOn

    // Wrapper — the PUBLIC boundary. Opens the module scope, then keys Render on the module id (below) so a
    // module rebuild remounts Render: fresh useState, fresh bind, instance re-resolved from the new container.
    // `rebuildOn` is a per-render selector over the CURRENT props (pure), handed straight to ModuleProvider,
    // which diffs the array elementwise; a dep-value change rebuilds the module (warm swap, not a keyed
    // remount of the whole subtree). `rebuildOn` never touches component props — `this.props` stays exactly P.
    const Wrapper: FC<Record<string, unknown>> = (props) => {
        const rebuildOn = rebuildSelector?.(props) as unknown[] | undefined
        return (
            <ModuleProvider providers={providers} rebuildOn={rebuildOn}>
                <Keyed target={target} props={props} />
            </ModuleProvider>
        )
    }
    Wrapper.displayName = target.name || "HybridComponent"

    const Public = options?.memo ? (memo(Wrapper) as FC<Record<string, unknown>>) : Wrapper

    hoistStatics(Public, target)
    if (!Public.displayName) Public.displayName = target.name || "HybridComponent"

    return Public
}

// Keyed — keys Render on the module id. A module rebuild (rebuildOn / parent cascade) mints a new module
// with a new id → Render remounts, avoiding the identity/state tear where useResolve returns the new
// instance while Render's fiber keeps the old React state.
type PipeProps = {
    target: ComponentClass
    props: Record<string, unknown>
}

function Keyed({ target, props }: PipeProps): ReactNode {
    const module = useModule()
    return <Render key={module.id} target={target} props={props} />
}

// Render — resolves the singleton instance from its own module, bridges React state onto it, renders the
// leaf as its own fiber.
function Render({ target, props }: PipeProps): ReactNode {
    // The instance is a registered singleton provider in this module — resolve it, don't re-construct.
    const instance = useResolve(target) as AbstractComponent<unknown, object>

    // React is the canonical state store after mount. The subclass `state = {…}` field seeds the initializer.
    const [state, setState] = useState(() => getInitialState(instance))

    // Bind the render snapshot (props + state) and the setter onto the instance BEFORE the leaf renders,
    // so `this.props` / `this.state` match this render attempt and `this.setState` is armed.
    bindRenderState(instance, props, state, setState)

    // Detach the setter on unmount so a stale instance cannot schedule into a dead tree.
    useEffect(() => () => unbindRenderState(instance), [instance])

    // Never called manually — rendered as JSX, so an exotic (memo/observer) leaf works identically. The
    // spread carries real prop diffs; STATE_PROP punches setState through a userland wrapper's memo.
    const Leaf = instance.Component as FC<any>
    return <Leaf {...props} {...{ [STATE_PROP]: state }} />
}

// Statics hoisting
// ========================================

const SKIP = new Set<PropertyKey>(["prototype", "name", "length"])

function hoistStatics(target: object, source: object): void {
    for (const key of Reflect.ownKeys(source)) {
        if (SKIP.has(key)) continue
        const descriptor = Object.getOwnPropertyDescriptor(source, key)
        if (descriptor) Object.defineProperty(target, key, descriptor)
    }
}
