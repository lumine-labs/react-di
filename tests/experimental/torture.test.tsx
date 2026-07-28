import { act, render, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Suspense, createContext, startTransition, useContext, useEffect, useState } from "react"
import type { ReactNode } from "react"

import { AbstractComponent, Component } from "../../src/experimental.js"
import { Root } from "../setup/react.js"

// Torture suite (handoff-class-component.md — "React Features That Must Be Tested" + "Construction During
// Render"). The model counts as done only if it survives these.
// ========================================

type Suspender = { read: () => void; resolve: () => void; suspendAgain: () => void }

function makeSuspender(startResolved = false): Suspender {
    let resolved = startResolved
    let promise: Promise<void> | undefined
    let resolveFn: (() => void) | undefined
    return {
        read() {
            if (resolved) return
            promise ??= new Promise<void>((r) => {
                resolveFn = r
            })
            throw promise
        },
        resolve() {
            resolved = true
            resolveFn?.()
        },
        suspendAgain() {
            resolved = false
            promise = undefined
            resolveFn = undefined
        },
    }
}

// 1 + 2: Suspense on initial render, and the abandoned-render measurement
// ========================================

describe("suspense: initial render + abandoned-render construction", () => {
    it("shows fallback, resolves to one committed+mounted instance, and never mounts an abandoned one", async () => {
        let constructions = 0
        let inits = 0
        let mounts = 0
        let unmounts = 0
        let destroys = 0
        const suspender = makeSuspender()

        class Panel extends AbstractComponent {
            constructor() {
                super()
                constructions++
            }
            onModuleInit(): void {
                inits++
            }
            onModuleMount(): void {
                mounts++
            }
            onModuleUnmount(): void {
                unmounts++
            }
            onModuleDestroy(): void {
                destroys++
            }
            Component = (): ReactNode => {
                suspender.read()
                return <div>ready</div>
            }
        }
        const Wrapped = Component()(Panel)

        const { container } = render(
            <Root>
                <Suspense fallback={<div>loading</div>}>
                    <Wrapped />
                </Suspense>
            </Root>
        )

        expect(container.textContent).toContain("loading")
        const constructionsWhileSuspended = constructions
        const initsWhileSuspended = inits
        // Nothing mounts while suspended — mount is a committed passive effect.
        expect(mounts).toBe(0)
        expect(unmounts).toBe(0)
        expect(destroys).toBe(0)

        await act(async () => {
            suspender.resolve()
            await Promise.resolve()
        })

        await waitFor(() => expect(container.textContent).toContain("ready"))

        // eslint-disable-next-line no-console
        console.log(
            `MEASURE[suspense-initial]: constructions total=${constructions} whileSuspended=${constructionsWhileSuspended} inits=${inits} initsWhileSuspended=${initsWhileSuspended} mounts=${mounts} unmounts=${unmounts} destroys=${destroys}`
        )

        // Exactly one instance is mounted (committed); abandoned attempts never mount → no mount/unmount/
        // destroy leak.
        expect(mounts).toBe(1)
        expect(unmounts).toBe(0)
        expect(destroys).toBe(0)

        // PINNED behavior (React 19.2 + jsdom, deterministic across runs): the module + instance are
        // constructed and onModuleInit-ed ONCE PER RENDER ATTEMPT — the useState initializer in
        // ModuleProvider re-runs each time a suspended render is retried. Here: 3 constructions / 3 inits
        // for ONE committed component. Abandoned instances are never mounted/unmounted/destroyed (they
        // become garbage). CONSTRAINT (documented in component-hybrid.md): init-phase side effects must be
        // abandonment-safe — a resource acquired in onModuleInit on an abandoned attempt is never released
        // (no onModuleDestroy for a module that never committed). If React/toolchain changes these counts,
        // re-measure; the invariants below are the load-bearing part.
        expect(inits).toBe(constructions) // every construction runs init
        expect(constructions).toBeGreaterThan(mounts) // abandoned instances WERE created (the pathology)
        expect(constructions).toBe(3)
        expect(inits).toBe(3)
    })
})

// 3: Suspense after commit
// ========================================

describe("suspense: after commit", () => {
    it("suspends on a state-driven update, keeps instance identity, preserves this.state on resume", async () => {
        const instances: unknown[] = []
        let bump: (() => void) | null = null
        const suspender = makeSuspender(true) // committed render succeeds

        class Panel extends AbstractComponent<{}, { phase: number }> {
            state = { phase: 0 }
            constructor() {
                super()
                instances.push(this)
            }
            Component = (): ReactNode => {
                bump = () => this.setState({ phase: 1 })
                suspender.read()
                return <div>phase:{this.state.phase}</div>
            }
        }
        const Wrapped = Component()(Panel)

        const { container } = render(
            <Root>
                <Suspense fallback={<div>loading</div>}>
                    <Wrapped />
                </Suspense>
            </Root>
        )
        expect(container.textContent).toContain("phase:0")

        // Make the next render suspend, then drive a state update.
        suspender.suspendAgain()
        act(() => bump?.())

        await act(async () => {
            suspender.resolve()
            await Promise.resolve()
        })
        await waitFor(() => expect(container.textContent).toContain("phase:1"))

        expect(instances.length).toBe(1) // same instance across the suspend
    })
})

// 4: Transitions
// ========================================

describe("transitions", () => {
    it("keeps old UI interactive while new props suspend, and exposes the latest render attempt's props", async () => {
        const suspenders: Record<string, Suspender> = {
            a: makeSuspender(true),
            b: makeSuspender(false),
        }
        let readProps: (() => string) | null = null
        let setId: ((id: string) => void) | null = null

        class Panel extends AbstractComponent<{ id: string }> {
            getId = (): string => this.props.id
            Component = (): ReactNode => {
                readProps = this.getId
                suspenders[this.props.id]!.read()
                return <div>committed:{this.props.id}</div>
            }
        }
        const Wrapped = Component()(Panel)

        function Harness(): ReactNode {
            const [id, setIdState] = useState("a")
            setId = setIdState
            return (
                <Root>
                    <Suspense fallback={<div>loading</div>}>
                        <Wrapped id={id} />
                    </Suspense>
                </Root>
            )
        }

        const { container } = render(<Harness />)
        expect(container.textContent).toContain("committed:a")

        // Transition to "b" — its resource suspends; old committed UI ("a") stays visible.
        act(() => startTransition(() => setId?.("b")))
        expect(container.textContent).toContain("committed:a") // old UI stays

        // Probe: an instance method invoked from the OLD committed UI during the pending transition.
        const observed = readProps!()
        // eslint-disable-next-line no-console
        console.log(`MEASURE[transition-props]: this.props.id during pending transition = "${observed}"`)

        // Let the transition finish.
        await act(async () => {
            suspenders.b!.resolve()
            await Promise.resolve()
        })
        await waitFor(() => expect(container.textContent).toContain("committed:b"))

        // PINNED semantic: `this.props` reflects the LATEST RENDER ATTEMPT, not the committed value.
        // During a pending transition the committed UI still shows "a", but the suspended render for "b"
        // already ran bindRenderState (mutating instance.props before the leaf suspended), so an instance
        // method invoked from the OLD committed UI observes "b". Mutable instance fields live outside Fiber
        // state — documented in component-hybrid.md; not assumed broken, just measured.
        expect(observed).toBe("b")
    })

    it("runs setState natively inside startTransition", () => {
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

// 5: Context
// ========================================

describe("context", () => {
    it("re-renders the leaf on context change without re-rendering the wrapper (stable this.props)", () => {
        const Ctx = createContext(0)
        let leafRenders = 0
        const propsRefs: unknown[] = []
        let bumpCtx: (() => void) | null = null

        const Panel = Component()(
            class extends AbstractComponent<{ label: string }> {
                Component = (): ReactNode => {
                    leafRenders++
                    propsRefs.push(this.props)
                    const value = useContext(Ctx)
                    return (
                        <output>
                            {this.props.label}:{value}
                        </output>
                    )
                }
            }
        )

        function CtxHost({ children }: { children: ReactNode }): ReactNode {
            const [v, setV] = useState(0)
            bumpCtx = () => setV((x) => x + 1)
            return <Ctx.Provider value={v}>{children}</Ctx.Provider>
        }

        const { container } = render(
            <Root>
                <CtxHost>
                    <Panel label="fixed" />
                </CtxHost>
            </Root>
        )
        expect(container.querySelector("output")!.textContent).toBe("fixed:0")
        expect(leafRenders).toBe(1)

        act(() => bumpCtx?.())
        expect(container.querySelector("output")!.textContent).toBe("fixed:1")
        expect(leafRenders).toBe(2) // leaf re-rendered on context change
        // Render (hence Wrapper) did NOT re-run: this.props was not reassigned → same reference.
        expect(propsRefs[0]).toBe(propsRefs[1])
    })

    it("re-renders the leaf on context change even under memo: true", () => {
        const Ctx = createContext(0)
        let leafRenders = 0
        let bumpCtx: (() => void) | null = null

        const Panel = Component({ memo: true })(
            class extends AbstractComponent {
                Component = (): ReactNode => {
                    leafRenders++
                    const value = useContext(Ctx)
                    return <output>{value}</output>
                }
            }
        )

        function CtxHost({ children }: { children: ReactNode }): ReactNode {
            const [v, setV] = useState(0)
            bumpCtx = () => setV((x) => x + 1)
            return <Ctx.Provider value={v}>{children}</Ctx.Provider>
        }

        const { container } = render(
            <Root>
                <CtxHost>
                    <Panel />
                </CtxHost>
            </Root>
        )
        expect(leafRenders).toBe(1)
        act(() => bumpCtx?.())
        expect(container.querySelector("output")!.textContent).toBe("1")
        expect(leafRenders).toBe(2)
    })
})

// 6: Rapid prop changes
// ========================================

describe("rapid prop changes", () => {
    it("settles on the last value with effects logged in order", () => {
        const effectLog: number[] = []
        let setValue: ((v: number) => void) | null = null

        const Panel = Component()(
            class extends AbstractComponent<{ value: number }> {
                Component = (): ReactNode => {
                    const value = this.props.value
                    useEffect(() => {
                        effectLog.push(value)
                    }, [value])
                    return <output>{value}</output>
                }
            }
        )

        function Harness(): ReactNode {
            const [value, setValueState] = useState(0)
            setValue = setValueState
            return (
                <Root>
                    <Panel value={value} />
                </Root>
            )
        }

        const { container } = render(<Harness />)
        for (let i = 1; i <= 5; i++) {
            act(() => setValue?.(i))
        }
        expect(container.querySelector("output")!.textContent).toBe("5")
        expect(effectLog).toEqual([0, 1, 2, 3, 4, 5]) // in order, no skips or reorder
    })
})

// 7: Conditional mount/unmount cycling
// ========================================

describe("conditional mount/unmount cycling", () => {
    it("matches instance + lifecycle counts to cycles with no accumulating leak", async () => {
        let constructions = 0
        let mounts = 0
        let unmounts = 0
        let destroys = 0
        let toggle: (() => void) | null = null
        let visibleNow = false

        const Panel = Component()(
            class extends AbstractComponent {
                constructor() {
                    super()
                    constructions++
                }
                onModuleMount(): void {
                    mounts++
                }
                onModuleUnmount(): void {
                    unmounts++
                }
                onModuleDestroy(): void {
                    destroys++
                }
                Component = (): ReactNode => <div>on</div>
            }
        )

        function Harness(): ReactNode {
            const [visible, setVisible] = useState(false)
            toggle = () => {
                visibleNow = !visibleNow
                setVisible(visibleNow)
            }
            return <Root>{visible && <Panel />}</Root>
        }

        render(<Harness />)

        const cycles = 3
        for (let i = 0; i < cycles; i++) {
            act(() => toggle?.()) // mount
            await act(async () => {
                toggle?.() // unmount
                await Promise.resolve()
            })
        }
        await act(async () => {
            await Promise.resolve()
        })

        // eslint-disable-next-line no-console
        console.log(
            `MEASURE[cycling]: cycles=${cycles} constructions=${constructions} mounts=${mounts} unmounts=${unmounts} destroys=${destroys}`
        )
        expect(constructions).toBe(cycles)
        expect(mounts).toBe(cycles)
        expect(unmounts).toBe(cycles)
        expect(destroys).toBe(cycles)
    })
})
