/**
 * Type-regression consumer for the experimental class-backed component (`Component` field style).
 *
 * Compiled against the PUBLISHED declarations (`@luminelabs/react-di/experimental`), nothing runs.
 * `tsc --noEmit` is the whole test. This file is IDENTICAL between the react18 and react19 consumers —
 * the profiles differ only in @types/react major and module resolution, which is exactly the variable
 * under test here: `JSX.ElementClass` is `extends React.Component<any>` plus `render(): ReactNode`, and
 * react18's `React.Component` additionally requires a `refs` member that react19 dropped. If
 * `AbstractComponent`'s phantom `refs` (or `render`) were missing, THIS FILE WOULD FAIL TO COMPILE (TS2786)
 * — so a green run under BOTH majors is the standing proof the phantom set satisfies both.
 */

import { Component, AbstractComponent } from "@luminelabs/react-di/experimental"
import { memo } from "react"
import type { ReactNode } from "react"

// --- Owner's snippet: decorator form, field render, 0 deps ----------------
@Component()
class Child extends AbstractComponent<{ a: string }> {
    Component = (): ReactNode => <div>{this.props.a}</div>
}

const ok = <Child a="x" />
// @ts-expect-error unknown prop `b`
const unknownProp = <Child b="x" />
// @ts-expect-error missing required prop `a`
const missingProp = <Child />

// --- state + setState typing, and the render/forceUpdate phantoms ---------
@Component()
class Stateful extends AbstractComponent<{ a: string }, { count: number }> {
    state = { count: 0 }
    inc = (): void => {
        this.setState({ count: this.state.count + 1 }) // partial
        this.setState((s) => ({ count: s.count + 1 })) // functional, sees Readonly<S>
        // @ts-expect-error `bad` is not a key of S
        this.setState({ bad: 1 })
    }
    Component = (): ReactNode => {
        const n: number = this.state.count // `S` flows: this.state is typed
        // @ts-expect-error render is a `never` phantom — not callable (real render path is this field)
        this.render()
        // @ts-expect-error forceUpdate is a `never` phantom — not callable
        this.forceUpdate()
        return <div>{n}</div>
    }
}
const stateful = <Stateful a="y" />

// NOTE: `setState` is PUBLIC (a `protected` setState fails JSX.ElementClass assignability — see
// AbstractComponent's visibility note), so an external `instance.setState(...)` compiles; prefer domain
// methods by convention. Nothing to @ts-expect-error here.

// --- userland-wrapped leaf (exotic component value on the field) ----------
@Component()
class WrappedLeaf extends AbstractComponent<{ a: string }> {
    Component = memo((): ReactNode => <div>{this.props.a}</div>)
}
const wrapped = <WrappedLeaf a="z" />

// --- options: providers + memo --------------------------------------------
class Local {}

@Component({ providers: [Local], memo: true })
class Scoped extends AbstractComponent<{ a: string }> {
    constructor(private readonly local: Local) {
        super()
        void this.local
    }
    Component = (): ReactNode => <div>{this.props.a}</div>
}
const scoped = <Scoped a="s" />

// --- options.rebuildOn selector: <Props> anchor types the selector and checks the class's P ---
type RebuildProps = { productId: string; tenantId: string }

@Component<RebuildProps>({
    providers: [Local],
    rebuildOn: (props) => [props.productId, props.tenantId], // props typed Readonly<RebuildProps>
})
class Rebuildable extends AbstractComponent<RebuildProps> {
    Component = (): ReactNode => <div>{this.props.productId}</div>
    check(): string {
        return this.props.tenantId // this.props stays exactly RebuildProps — no reserved prop
    }
}
const rebuildable = <Rebuildable productId="p" tenantId="t" />

// The selector may only read declared props.
@Component<RebuildProps>({
    // @ts-expect-error `nope` is not a prop of RebuildProps
    rebuildOn: (props) => [props.nope],
})
class BadSelector extends AbstractComponent<RebuildProps> {
    Component = (): ReactNode => null
}

// Collision: the <Props> anchor must match the class's own P — a mismatch fails to compile.
// @ts-expect-error option P ({a}) disagrees with the class's AbstractComponent<{b}>
@Component<{ a: string }>({})
class Mismatch extends AbstractComponent<{ b: string }> {
    Component = (): ReactNode => null
}

// --- Constructor DI arity: 3 deps must still type as JSX (FC-branch bypass) ---
class Dep1 {}
class Dep2 {}
class Dep3 {}

class ThreeDeps extends AbstractComponent<{ label: string }> {
    constructor(
        private readonly d1: Dep1,
        private readonly d2: Dep2,
        private readonly d3: Dep3
    ) {
        super()
        void this.d1
        void this.d2
        void this.d3
    }
    Component = (): ReactNode => <span>{this.props.label}</span>
}
const ThreeDepsComponent = Component()(ThreeDeps)
const threeDeps = <ThreeDepsComponent label="ok" />
// @ts-expect-error still checks props: `label` is required
const threeDepsMissing = <ThreeDepsComponent />

export {
    ok,
    unknownProp,
    missingProp,
    stateful,
    wrapped,
    scoped,
    rebuildable,
    BadSelector,
    Mismatch,
    threeDeps,
    threeDepsMissing,
}
