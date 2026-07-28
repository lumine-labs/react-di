import { act, render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Component as ReactComponent, memo, startTransition, useReducer, useState } from "react"
import type { ReactNode } from "react"

import { Container, decorate, Inject, Injectable } from "../../src/container/index.js"
import type { Constructor } from "../../src/container/index.js"
import { useContainer, useModuleRebuild } from "../../src/react/hooks/useModuleContext.js"
import { useResolve } from "../../src/react/hooks/useResolve.js"
import { ModuleProvider } from "../../src/react/providers/ModuleProvider.js"
import { AbstractComponent, Component } from "../../src/experimental.js"
import { Root } from "../setup/react.js"
import { flush, tracked } from "../setup/helpers.js"

// Experimental class-backed components — React-canonical state, module-backed scopes.
// ========================================
//
// Authoritative specs: agent-notes/design/handoff-class-component.md and handoff-state-setstate.md.
// The render body is `Component = () => …` (a field holding a real React component); `this.state` is backed
// by React's own useState. The Bridge / fallback / onCatch / lifecycle methods were removed — errors go to
// the nearest React boundary, React effects are the lifecycle mechanism. Constructor injection is wired
// through explicit `decorate(Inject(TOKEN), cls, i)` because esbuild emits no `design:paramtypes`.

function silenceReactErrorLog(): () => void {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    return () => spy.mockRestore()
}

class OuterBoundary extends ReactComponent<{ children: ReactNode }, { error: unknown }> {
    override state: { error: unknown } = { error: null }
    static getDerivedStateFromError(error: unknown): { error: unknown } {
        return { error }
    }
    override render(): ReactNode {
        if (this.state.error) return <div>outer-fallback</div>
        return this.props.children
    }
}

// Basics
// ========================================

describe("basics", () => {
    it("renders the leaf and runs hooks inside it", () => {
        let bump: (() => void) | null = null

        const Panel = Component()(
            class extends AbstractComponent {
                Component = (): ReactNode => {
                    const [n, setN] = useState(0)
                    bump = () => setN((v) => v + 1)
                    return <output>{n}</output>
                }
            }
        )

        const { container } = render(
            <Root>
                <Panel />
            </Root>
        )
        expect(container.querySelector("output")!.textContent).toBe("0")
        act(() => bump?.())
        expect(container.querySelector("output")!.textContent).toBe("1")
    })

    it("keeps one instance across re-renders and a fresh one after remount", () => {
        const seen: unknown[] = []
        let bump: (() => void) | null = null
        let show = true
        let toggle: (() => void) | null = null

        const Panel = Component()(
            class extends AbstractComponent {
                constructor() {
                    super()
                    seen.push(this)
                }
                Component = (): ReactNode => {
                    const [, setN] = useState(0)
                    bump = () => setN((v) => v + 1)
                    return null
                }
            }
        )

        function Harness(): ReactNode {
            const [, force] = useReducer((c: number) => c + 1, 0)
            const [visible, setVisible] = useState(true)
            toggle = () => {
                show = !show
                setVisible(show)
                force()
            }
            return <Root>{visible && <Panel />}</Root>
        }

        render(<Harness />)
        act(() => bump?.())
        expect(seen.length).toBe(1) // one instance, ordinary re-render reused it

        act(() => toggle?.()) // unmount
        act(() => toggle?.()) // remount → fresh instance
        expect(seen.length).toBe(2)
        expect(seen[0]).not.toBe(seen[1])
    })

    it("delivers fresh props on a parent re-render", () => {
        let setLabel: ((v: string) => void) | null = null

        const Panel = Component()(
            class extends AbstractComponent<{ label: string }> {
                Component = (): ReactNode => <span>{this.props.label}</span>
            }
        )

        function Harness(): ReactNode {
            const [label, setLabelState] = useState("a")
            setLabel = setLabelState
            return (
                <Root>
                    <Panel label={label} />
                </Root>
            )
        }

        const { container } = render(<Harness />)
        expect(container.querySelector("span")!.textContent).toBe("a")
        act(() => setLabel?.("b"))
        expect(container.querySelector("span")!.textContent).toBe("b")
    })

    it("resolves constructor deps from the parent container when there are no providers", () => {
        class Api {
            readonly tag = "api"
        }
        decorate(Injectable(), Api)

        class PanelImpl extends AbstractComponent {
            constructor(readonly api: Api) {
                super()
            }
            Component = (): ReactNode => <div>{this.api.tag}</div>
        }
        decorate(Injectable(), PanelImpl)
        decorate(Inject(Api) as ParameterDecorator, PanelImpl as unknown as Constructor, 0)

        const Panel = Component()(PanelImpl)

        const { container } = render(
            <Root providers={[Api]}>
                <Panel />
            </Root>
        )
        expect(container.querySelector("div")!.textContent).toBe("api")
    })

    it("lets a leaf throw escape to the nearest boundary (no internal swallowing)", () => {
        const restore = silenceReactErrorLog()

        const Panel = Component()(
            class extends AbstractComponent {
                Component = (): ReactNode => {
                    throw new Error("leaf boom")
                }
            }
        )

        const { container } = render(
            <OuterBoundary>
                <Root>
                    <Panel />
                </Root>
            </OuterBoundary>
        )
        expect(container.textContent).toContain("outer-fallback")
        restore()
    })
})

// State (handoff #2)
// ========================================

describe("state", () => {
    it("renders the initial state field", () => {
        const Panel = Component()(
            class extends AbstractComponent<{}, { count: number }> {
                state = { count: 5 }
                Component = (): ReactNode => <output>{this.state.count}</output>
            }
        )
        const { container } = render(
            <Root>
                <Panel />
            </Root>
        )
        expect(container.querySelector("output")!.textContent).toBe("5")
    })

    it("merges an object patch, preserving untouched fields", () => {
        let patch: (() => void) | null = null
        const Panel = Component()(
            class extends AbstractComponent<{}, { loading: boolean; selectedId: string | null }> {
                state = { loading: false, selectedId: null as string | null }
                Component = (): ReactNode => {
                    patch = () => this.setState({ loading: true })
                    return (
                        <output>
                            {String(this.state.loading)}:{String(this.state.selectedId)}
                        </output>
                    )
                }
            }
        )
        const { container } = render(
            <Root>
                <Panel />
            </Root>
        )
        expect(container.querySelector("output")!.textContent).toBe("false:null")
        act(() => patch?.())
        expect(container.querySelector("output")!.textContent).toBe("true:null")
    })

    it("applies a functional update against the latest state", () => {
        let inc: (() => void) | null = null
        const Panel = Component()(
            class extends AbstractComponent<{}, { count: number }> {
                state = { count: 0 }
                Component = (): ReactNode => {
                    inc = () => this.setState((s) => ({ count: s.count + 1 }))
                    return <output>{this.state.count}</output>
                }
            }
        )
        const { container } = render(
            <Root>
                <Panel />
            </Root>
        )
        act(() => inc?.())
        act(() => inc?.())
        expect(container.querySelector("output")!.textContent).toBe("2")
    })

    it("batches two functional updates in one handler into +2 and one re-render", () => {
        let renders = 0
        let doubleInc: (() => void) | null = null
        const Panel = Component()(
            class extends AbstractComponent<{}, { count: number }> {
                state = { count: 0 }
                Component = (): ReactNode => {
                    renders++
                    doubleInc = () => {
                        this.setState((s) => ({ count: s.count + 1 }))
                        this.setState((s) => ({ count: s.count + 1 }))
                    }
                    return <output>{this.state.count}</output>
                }
            }
        )
        const { container } = render(
            <Root>
                <Panel />
            </Root>
        )
        const before = renders
        act(() => doubleInc?.())
        expect(container.querySelector("output")!.textContent).toBe("2")
        expect(renders - before).toBe(1) // React 18 batching: a single re-render
    })

    it("preserves instance state across a parent re-render", () => {
        let inc: (() => void) | null = null
        let setLabel: ((v: string) => void) | null = null
        const Panel = Component()(
            class extends AbstractComponent<{ label: string }, { count: number }> {
                state = { count: 0 }
                Component = (): ReactNode => {
                    inc = () => this.setState((s) => ({ count: s.count + 1 }))
                    return (
                        <output>
                            {this.props.label}:{this.state.count}
                        </output>
                    )
                }
            }
        )
        function Harness(): ReactNode {
            const [label, setLabelState] = useState("a")
            setLabel = setLabelState
            return (
                <Root>
                    <Panel label={label} />
                </Root>
            )
        }
        const { container } = render(<Harness />)
        act(() => inc?.())
        expect(container.querySelector("output")!.textContent).toBe("a:1")
        act(() => setLabel?.("b"))
        expect(container.querySelector("output")!.textContent).toBe("b:1") // state survives
    })

    it("coexists with hook state: neither resets the other", () => {
        let bumpHook: (() => void) | null = null
        let bumpState: (() => void) | null = null
        const Panel = Component()(
            class extends AbstractComponent<{}, { n: number }> {
                state = { n: 0 }
                Component = (): ReactNode => {
                    const [h, setH] = useState(0)
                    bumpHook = () => setH((v) => v + 1)
                    bumpState = () => this.setState((s) => ({ n: s.n + 1 }))
                    return (
                        <output>
                            {h}:{this.state.n}
                        </output>
                    )
                }
            }
        )
        const { container } = render(
            <Root>
                <Panel />
            </Root>
        )
        act(() => bumpHook?.())
        expect(container.querySelector("output")!.textContent).toBe("1:0")
        act(() => bumpState?.())
        expect(container.querySelector("output")!.textContent).toBe("1:1") // hook state survived
        act(() => bumpHook?.())
        expect(container.querySelector("output")!.textContent).toBe("2:1") // this.state survived
    })

    it("re-renders the leaf on setState", () => {
        let renders = 0
        let inc: (() => void) | null = null
        const Panel = Component()(
            class extends AbstractComponent<{}, { count: number }> {
                state = { count: 0 }
                Component = (): ReactNode => {
                    renders++
                    inc = () => this.setState((s) => ({ count: s.count + 1 }))
                    return <output>{this.state.count}</output>
                }
            }
        )
        render(
            <Root>
                <Panel />
            </Root>
        )
        const before = renders
        act(() => inc?.())
        expect(renders).toBe(before + 1)
    })

    it("resets to fresh initial state when the key changes", () => {
        let inc: (() => void) | null = null
        let bumpKey: (() => void) | null = null
        const Panel = Component()(
            class extends AbstractComponent<{}, { count: number }> {
                state = { count: 0 }
                Component = (): ReactNode => {
                    inc = () => this.setState((s) => ({ count: s.count + 1 }))
                    return <output>{this.state.count}</output>
                }
            }
        )
        function Harness(): ReactNode {
            const [key, setKey] = useState("a")
            bumpKey = () => setKey("b")
            return (
                <Root>
                    <Panel key={key} />
                </Root>
            )
        }
        const { container } = render(<Harness />)
        act(() => inc?.())
        expect(container.querySelector("output")!.textContent).toBe("1")
        act(() => bumpKey?.())
        expect(container.querySelector("output")!.textContent).toBe("0") // fresh instance + state
    })

    it("starts from fresh initial state after a conditional unmount/remount", () => {
        let inc: (() => void) | null = null
        let toggle: (() => void) | null = null
        let visibleNow = true
        const Panel = Component()(
            class extends AbstractComponent<{}, { count: number }> {
                state = { count: 0 }
                Component = (): ReactNode => {
                    inc = () => this.setState((s) => ({ count: s.count + 1 }))
                    return <output>{this.state.count}</output>
                }
            }
        )
        function Harness(): ReactNode {
            const [visible, setVisible] = useState(true)
            toggle = () => {
                visibleNow = !visibleNow
                setVisible(visibleNow)
            }
            return <Root>{visible && <Panel />}</Root>
        }
        const { container } = render(<Harness />)
        act(() => inc?.())
        expect(container.querySelector("output")!.textContent).toBe("1")
        act(() => toggle?.()) // unmount
        act(() => toggle?.()) // remount
        expect(container.querySelector("output")!.textContent).toBe("0")
    })

    it("throws when setState is called before mount", () => {
        class Panel extends AbstractComponent<{}, { count: number }> {
            state = { count: 0 }
            Component = (): ReactNode => null
        }
        const instance = new Container().construct(Panel)
        expect(() => instance.setState({ count: 1 })).toThrow(
            "Cannot call setState() before the component is mounted."
        )
    })

    it("throws when setState is called after unmount", () => {
        let captured: AbstractComponent<{}, { count: number }> | null = null
        const Panel = Component()(
            class extends AbstractComponent<{}, { count: number }> {
                state = { count: 0 }
                constructor() {
                    super()
                    captured = this
                }
                Component = (): ReactNode => <output>{this.state.count}</output>
            }
        )
        const { unmount } = render(
            <Root>
                <Panel />
            </Root>
        )
        unmount()
        expect(() => captured!.setState({ count: 1 })).toThrow(
            "Cannot call setState() after the component has been disposed."
        )
    })

    it("works natively inside startTransition", () => {
        let inc: (() => void) | null = null
        const Panel = Component()(
            class extends AbstractComponent<{}, { count: number }> {
                state = { count: 0 }
                Component = (): ReactNode => {
                    inc = () => startTransition(() => this.setState((s) => ({ count: s.count + 1 })))
                    return <output>{this.state.count}</output>
                }
            }
        )
        const { container } = render(
            <Root>
                <Panel />
            </Root>
        )
        act(() => inc?.())
        expect(container.querySelector("output")!.textContent).toBe("1")
    })
})

// Wrapped-leaf coherence (userland-wrapped Component field)
// ========================================

describe("wrapped-leaf coherence", () => {
    it("re-renders on prop change and setState, but skips a pure parent cascade", () => {
        let leafRenders = 0
        let bumpState: (() => void) | null = null
        let setLabel: ((v: string) => void) | null = null
        let cascade: (() => void) | null = null

        const Panel = Component()(
            class extends AbstractComponent<{ label: string }, { n: number }> {
                state = { n: 0 }
                // Userland wrapping: the field is already a memo-wrapped component (exotic object).
                Component = memo((): ReactNode => {
                    leafRenders++
                    bumpState = () => this.setState((s) => ({ n: s.n + 1 }))
                    return (
                        <span>
                            {this.props.label}:{this.state.n}
                        </span>
                    )
                })
            }
        )

        function Harness(): ReactNode {
            const [label, setLabelState] = useState("a")
            const [, forceCascade] = useReducer((c: number) => c + 1, 0)
            setLabel = setLabelState
            cascade = forceCascade
            return (
                <Root>
                    <Panel label={label} />
                </Root>
            )
        }

        const { container } = render(<Harness />)
        expect(leafRenders).toBe(1)
        expect(container.querySelector("span")!.textContent).toBe("a:0")

        act(() => cascade?.()) // pure cascade, unchanged props, no setState → memo skips
        expect(leafRenders).toBe(1)

        act(() => setLabel?.("b")) // prop change → re-render
        expect(leafRenders).toBe(2)
        expect(container.querySelector("span")!.textContent).toBe("b:0")

        act(() => bumpState?.()) // setState → re-render (state value identity changes)
        expect(leafRenders).toBe(3)
        expect(container.querySelector("span")!.textContent).toBe("b:1")
    })
})

// memo option (public wrapper)
// ========================================

describe("memo option", () => {
    it("bails out of a parent cascade with unchanged props when memo: true", () => {
        let leafRenders = 0
        let cascade: (() => void) | null = null

        const Panel = Component({ memo: true })(
            class extends AbstractComponent<{ label: string }> {
                Component = (): ReactNode => {
                    leafRenders++
                    return <span>{this.props.label}</span>
                }
            }
        )

        function Harness(): ReactNode {
            const [, forceCascade] = useReducer((c: number) => c + 1, 0)
            cascade = forceCascade
            return (
                <Root>
                    <Panel label="fixed" />
                </Root>
            )
        }

        render(<Harness />)
        expect(leafRenders).toBe(1)
        act(() => cascade?.())
        expect(leafRenders).toBe(1) // memo'd public wrapper bailed → leaf untouched
    })
})

// Module-backed component scope (adjudication 4)
// ========================================

describe("module-backed scope", () => {
    it("gives component providers full module lifecycle and disposes on unmount", async () => {
        const log: string[] = []
        const Svc = tracked(log, "svc") as unknown as Constructor

        class PanelImpl extends AbstractComponent {
            constructor(readonly svc: unknown) {
                super()
            }
            Component = (): ReactNode => <div>ok</div>
        }
        decorate(Injectable(), PanelImpl)
        decorate(Inject(Svc) as ParameterDecorator, PanelImpl as unknown as Constructor, 0)

        const Panel = Component({ providers: [Svc] })(PanelImpl)

        const { unmount } = render(
            <Root>
                <Panel />
            </Root>
        )

        expect(log).toContain("svc:init")
        expect(log).toContain("svc:mount")

        unmount()
        await flush()

        expect(log).toContain("svc:unmount")
        expect(log).toContain("svc:destroy")
    })

    it("resolves the scoped provider into the instance and leaves the parent container unpolluted", () => {
        const log: string[] = []
        const Svc = tracked(log, "svc") as unknown as Constructor
        let captured: PanelImpl | null = null
        let parentContainer: Container | null = null

        class PanelImpl extends AbstractComponent {
            constructor(readonly svc: unknown) {
                super()
                captured = this
            }
            Component = (): ReactNode => <div>ok</div>
        }
        decorate(Injectable(), PanelImpl)
        decorate(Inject(Svc) as ParameterDecorator, PanelImpl as unknown as Constructor, 0)

        const Panel = Component({ providers: [Svc] })(PanelImpl)

        function Capture(): ReactNode {
            parentContainer = useContainer()
            return null
        }

        render(
            <Root>
                <Capture />
                <Panel />
            </Root>
        )

        expect(captured!.svc).toBeInstanceOf(Svc)
        // The scoped provider lives in the component's child module, not the parent (Root) container.
        expect(parentContainer!.isRegistered(Svc)).toBe(false)
    })

    it("makes the component instance resolvable by its own children (it is a provider)", () => {
        let captured: PanelImpl | null = null
        let resolvedByChild: unknown = null

        class PanelImpl extends AbstractComponent {
            constructor() {
                super()
                captured = this
            }
            Component = (): ReactNode => <ChildProbe />
        }
        const Panel = Component()(PanelImpl)

        function ChildProbe(): ReactNode {
            resolvedByChild = useResolve(PanelImpl)
            return null
        }

        render(
            <Root>
                <Panel />
            </Root>
        )

        expect(resolvedByChild).toBe(captured)
    })
})

// Module lifecycle family (the single lifecycle)
// ========================================

describe("module lifecycle family", () => {
    it("delivers onModule* to the component in order with its scope's providers (forward init/mount, LIFO teardown)", async () => {
        const log: string[] = []
        const Svc = tracked(log, "svc") as unknown as Constructor

        class PanelImpl extends AbstractComponent {
            constructor(readonly svc: unknown) {
                super()
            }
            onModuleInit(): void {
                log.push("panel:init")
            }
            onModuleMount(): void {
                log.push("panel:mount")
            }
            onModuleUnmount(): void {
                log.push("panel:unmount")
            }
            async onModuleDestroy(): Promise<void> {
                log.push("panel:destroy")
            }
            Component = (): ReactNode => <div>ok</div>
        }
        decorate(Injectable(), PanelImpl)
        decorate(Inject(Svc) as ParameterDecorator, PanelImpl as unknown as Constructor, 0)

        const Panel = Component({ providers: [Svc] })(PanelImpl)

        const { unmount } = render(
            <Root>
                <Panel />
            </Root>
        )

        // Svc is the component's dependency → constructed first → its hooks run first (forward).
        expect(log.indexOf("svc:init")).toBeLessThan(log.indexOf("panel:init"))
        expect(log.indexOf("svc:mount")).toBeLessThan(log.indexOf("panel:mount"))

        log.length = 0
        unmount()
        await flush()

        // LIFO teardown: the component (constructed last) tears down first.
        expect(log.indexOf("panel:unmount")).toBeLessThan(log.indexOf("svc:unmount"))
        expect(log.indexOf("panel:destroy")).toBeLessThan(log.indexOf("svc:destroy"))
    })

    it("lets setState in onModuleMount work (bridge is bound by the time the passive effect runs)", () => {
        const Panel = Component()(
            class extends AbstractComponent<{}, { ready: boolean }> {
                state = { ready: false }
                onModuleMount(): void {
                    this.setState({ ready: true })
                }
                Component = (): ReactNode => <output>{String(this.state.ready)}</output>
            }
        )

        const { container } = render(
            <Root>
                <Panel />
            </Root>
        )
        expect(container.querySelector("output")!.textContent).toBe("true")
    })

    it("throws when setState is called in onModuleInit (bridge not bound yet)", () => {
        const restore = silenceReactErrorLog()

        const Panel = Component()(
            class extends AbstractComponent<{}, { x: number }> {
                state = { x: 0 }
                onModuleInit(): void {
                    this.setState({ x: 1 })
                }
                Component = (): ReactNode => <output>{this.state.x}</output>
            }
        )

        expect(() =>
            render(
                <Root>
                    <Panel />
                </Root>
            )
        ).toThrow("Cannot call setState() before the component is mounted.")

        restore()
    })
})

// Module rebuild (identity + state coherence)
// ========================================

describe("module rebuild", () => {
    it("mints a fresh instance and resets state when the enclosing scope rebuilds", () => {
        const instances: unknown[] = []
        let inc: (() => void) | null = null
        let rebuild: (() => void) | null = null

        const Panel = Component()(
            class extends AbstractComponent<{}, { count: number }> {
                state = { count: 0 }
                constructor() {
                    super()
                    instances.push(this)
                }
                Component = (): ReactNode => {
                    inc = () => this.setState((s) => ({ count: s.count + 1 }))
                    return <output>{this.state.count}</output>
                }
            }
        )

        function Harness(): ReactNode {
            const [dep, setDep] = useState(0)
            rebuild = () => setDep((d) => d + 1)
            return (
                <Root>
                    <ModuleProvider rebuildOn={[dep]}>
                        <Panel />
                    </ModuleProvider>
                </Root>
            )
        }

        const { container } = render(<Harness />)
        act(() => inc?.())
        expect(container.querySelector("output")!.textContent).toBe("1")
        expect(instances.length).toBe(1)

        act(() => rebuild?.())

        // A new instance was constructed, and Render remounted (keyed on module.id) → state reset.
        expect(instances.length).toBe(2)
        expect(instances[0]).not.toBe(instances[1])
        expect(container.querySelector("output")!.textContent).toBe("0")
    })
})

// options.rebuildOn — class-owned rebuild policy (selector over props)
// ========================================

describe("options.rebuildOn selector", () => {
    it("rebuilds on a selector dep change: new instance, state reset, new-init before old teardown", async () => {
        const log: string[] = []
        let seq = 0
        const instances: unknown[] = []
        let inc: (() => void) | null = null
        let setDep: ((v: number) => void) | null = null

        const Panel = Component<{ dep: number }>({
            rebuildOn: (props) => [props.dep],
        })(
            class extends AbstractComponent<{ dep: number }, { count: number }> {
                state = { count: 0 }
                readonly id = ++seq
                constructor() {
                    super()
                    instances.push(this)
                }
                onModuleInit(): void {
                    log.push(`init#${this.id}`)
                }
                onModuleMount(): void {
                    log.push(`mount#${this.id}`)
                }
                onModuleUnmount(): void {
                    log.push(`unmount#${this.id}`)
                }
                async onModuleDestroy(): Promise<void> {
                    log.push(`destroy#${this.id}`)
                }
                Component = (): ReactNode => {
                    inc = () => this.setState((s) => ({ count: s.count + 1 }))
                    return (
                        <output>
                            {this.props.dep}:{this.state.count}
                        </output>
                    )
                }
            }
        )

        function Harness(): ReactNode {
            const [dep, setDepState] = useState(1)
            setDep = setDepState
            return (
                <Root>
                    <Panel dep={dep} />
                </Root>
            )
        }

        const { container } = render(<Harness />)
        act(() => inc?.())
        expect(container.querySelector("output")!.textContent).toBe("1:1")
        expect(instances.length).toBe(1)

        await act(async () => {
            setDep?.(2)
            await Promise.resolve()
        })

        // Fresh instance, state reset to the class-field initial, new props.
        expect(instances.length).toBe(2)
        expect(instances[0]).not.toBe(instances[1])
        expect(container.querySelector("output")!.textContent).toBe("2:0")

        // Rebuild ordering: the new instance inits BEFORE the old one unmounts/destroys.
        await flush()
        expect(log.indexOf("init#2")).toBeGreaterThan(-1)
        expect(log.indexOf("init#2")).toBeLessThan(log.indexOf("unmount#1"))
        expect(log.indexOf("init#2")).toBeLessThan(log.indexOf("destroy#1"))
    })

    it("does not rebuild when the selector deps are unchanged across a re-render", () => {
        const instances: unknown[] = []
        let cascade: (() => void) | null = null

        const Panel = Component<{ dep: number }>({
            rebuildOn: (props) => [props.dep],
        })(
            class extends AbstractComponent<{ dep: number }> {
                constructor() {
                    super()
                    instances.push(this)
                }
                Component = (): ReactNode => <output>{this.props.dep}</output>
            }
        )

        function Harness(): ReactNode {
            const [, force] = useReducer((c: number) => c + 1, 0)
            cascade = force
            return (
                <Root>
                    <Panel dep={7} />
                </Root>
            )
        }

        render(<Harness />)
        expect(instances.length).toBe(1)
        act(() => cascade?.())
        act(() => cascade?.())
        expect(instances.length).toBe(1) // deps unchanged → no rebuild
    })

    it("passes the CURRENT render's props to the selector", () => {
        const seenBySelector: Array<{ dep: number }> = []
        let setDep: ((v: number) => void) | null = null

        const Panel = Component<{ dep: number }>({
            rebuildOn: (props) => {
                seenBySelector.push({ ...props })
                return [props.dep]
            },
        })(
            class extends AbstractComponent<{ dep: number }> {
                Component = (): ReactNode => <output>{this.props.dep}</output>
            }
        )

        function Harness(): ReactNode {
            const [dep, setDepState] = useState(3)
            setDep = setDepState
            return (
                <Root>
                    <Panel dep={dep} />
                </Root>
            )
        }

        render(<Harness />)
        expect(seenBySelector.at(-1)!.dep).toBe(3)
        act(() => setDep?.(9))
        expect(seenBySelector.at(-1)!.dep).toBe(9) // selector saw the new render's props
    })

    it("coexists with memo: true — cascade bails, a dep-value change rebuilds", () => {
        let leafRenders = 0
        const instances: unknown[] = []
        let cascade: (() => void) | null = null
        let setDep: ((v: number) => void) | null = null

        const Panel = Component<{ dep: number }>({
            memo: true,
            rebuildOn: (props) => [props.dep],
        })(
            class extends AbstractComponent<{ dep: number }> {
                constructor() {
                    super()
                    instances.push(this)
                }
                Component = (): ReactNode => {
                    leafRenders++
                    return <output>{this.props.dep}</output>
                }
            }
        )

        function Harness(): ReactNode {
            const [dep, setDepState] = useState(1)
            const [, force] = useReducer((c: number) => c + 1, 0)
            setDep = setDepState
            cascade = force
            return (
                <Root>
                    <Panel dep={dep} />
                </Root>
            )
        }

        const { container } = render(<Harness />)
        expect(leafRenders).toBe(1)
        expect(instances.length).toBe(1)

        // Parent cascade, dep prop unchanged → memo'd wrapper bails, no rebuild, no leaf render.
        act(() => cascade?.())
        expect(leafRenders).toBe(1)
        expect(instances.length).toBe(1)

        // Dep value changes (props change through the memo) → rebuild.
        act(() => setDep?.(2))
        expect(instances.length).toBe(2)
        expect(container.querySelector("output")!.textContent).toBe("2")
    })
})

// Manual self-rebuild from inside Component
// ========================================

describe("manual rebuild", () => {
    it("self-rebuilds via useModuleRebuild() called inside Component", () => {
        const instances: unknown[] = []
        let inc: (() => void) | null = null
        let selfRebuild: (() => void) | null = null

        const Panel = Component()(
            class extends AbstractComponent<{}, { count: number }> {
                state = { count: 0 }
                constructor() {
                    super()
                    instances.push(this)
                }
                Component = (): ReactNode => {
                    inc = () => this.setState((s) => ({ count: s.count + 1 }))
                    selfRebuild = useModuleRebuild()
                    return <output>{this.state.count}</output>
                }
            }
        )

        const { container } = render(
            <Root>
                <Panel />
            </Root>
        )
        act(() => inc?.())
        expect(container.querySelector("output")!.textContent).toBe("1")
        expect(instances.length).toBe(1)

        act(() => selfRebuild?.())
        expect(instances.length).toBe(2)
        expect(instances[0]).not.toBe(instances[1])
        expect(container.querySelector("output")!.textContent).toBe("0") // fresh instance + state
    })
})
