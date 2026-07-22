import { act, render } from "@testing-library/react"
import { Component, type ReactNode, useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ModuleProvider } from "../../src/react/providers/ModuleProvider"
import type {
    FactoryModuleParams,
    RootModuleParams,
    ScopedModuleParams,
} from "../../src/core/module/resolution.types"
import { useModuleContext } from "../../src/react/hooks/useModuleContext"

// Shared recorded log across the tree.
let log: string[] = []

// LogModule always supplies the lifecycle hooks, so it only models the hook-bearing (owned)
// branches of the discriminated union — never the inherit/container branch, which forbids them.
type LogModuleParams = RootModuleParams | FactoryModuleParams | ScopedModuleParams

type LogModuleProps = LogModuleParams & {
    name: string
    children?: ReactNode
}

function LogModule({ name, children, ...params }: LogModuleProps) {
    return (
        <ModuleProvider
            {...params}
            onModuleMount={() => log.push(`${name}:mount`)}
            onModuleUnmount={() => log.push(`${name}:unmount`)}
            onModuleDestroy={() => log.push(`${name}:destroy`)}
        >
            {children}
        </ModuleProvider>
    )
}

// Flush the deferred (microtask) teardown + its async chain, inside act.
async function settle(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
    })
}

class ErrorBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
    constructor(props: { children: ReactNode; onError: () => void }) {
        super(props)
        this.state = { failed: false }
    }
    static getDerivedStateFromError() {
        return { failed: true }
    }
    componentDidCatch() {
        this.props.onError()
    }
    render() {
        return this.state.failed ? null : this.props.children
    }
}

beforeEach(() => {
    log = []
})

describe("cross-module lifecycle matrix", () => {
    it("basic tree A→B→C: mount A,B,C / destroy C,B,A", async () => {
        const view = render(
            <LogModule root name="A">
                <LogModule name="B">
                    <LogModule name="C" />
                </LogModule>
            </LogModule>
        )

        expect(log).toEqual(["A:mount", "B:mount", "C:mount"])

        log = []
        view.unmount()
        await settle()

        expect(log).toEqual(["C:unmount", "C:destroy", "B:unmount", "B:destroy", "A:unmount", "A:destroy"])
    })

    it("siblings: mount P,C1,C2 / destroy C2,C1,P", async () => {
        const view = render(
            <LogModule root name="P">
                <LogModule name="C1" />
                <LogModule name="C2" />
            </LogModule>
        )

        expect(log).toEqual(["P:mount", "C1:mount", "C2:mount"])

        log = []
        view.unmount()
        await settle()

        expect(log).toEqual(["C2:unmount", "C2:destroy", "C1:unmount", "C1:destroy", "P:unmount", "P:destroy"])
    })

    it("deep mixed tree: depth-first mount, full-reverse destroy", async () => {
        const view = render(
            <LogModule root name="A">
                <LogModule name="B">
                    <LogModule name="D" />
                </LogModule>
                <LogModule name="C" />
            </LogModule>
        )

        expect(log).toEqual(["A:mount", "B:mount", "D:mount", "C:mount"])

        log = []
        view.unmount()
        await settle()

        expect(log).toEqual([
            "C:unmount",
            "C:destroy",
            "D:unmount",
            "D:destroy",
            "B:unmount",
            "B:destroy",
            "A:unmount",
            "A:destroy",
        ])
    })

    it("dynamic child under a mounted parent: immediate cascade", async () => {
        let setShow!: (value: boolean) => void

        function Harness() {
            const [show, set] = useState(false)
            setShow = set
            return (
                <LogModule root name="P">
                    {show ? <LogModule name="C" /> : null}
                </LogModule>
            )
        }

        render(<Harness />)
        expect(log).toEqual(["P:mount"])

        log = []
        await act(async () => {
            setShow(true)
        })
        expect(log).toEqual(["C:mount"])
    })

    it("dynamic subtree add mounts the whole subtree parent-first", async () => {
        let setShow!: (value: boolean) => void

        function Harness() {
            const [show, set] = useState(false)
            setShow = set
            return (
                <LogModule root name="P">
                    {show ? (
                        <LogModule name="C">
                            <LogModule name="GC" />
                        </LogModule>
                    ) : null}
                </LogModule>
            )
        }

        render(<Harness />)
        log = []

        await act(async () => {
            setShow(true)
        })
        expect(log).toEqual(["C:mount", "GC:mount"])
    })

    it("subtree removal tears down only that subtree in correct order", async () => {
        let setShow!: (value: boolean) => void

        function Harness() {
            const [show, set] = useState(true)
            setShow = set
            return (
                <LogModule root name="P">
                    <LogModule name="Keep" />
                    {show ? (
                        <LogModule name="C">
                            <LogModule name="GC" />
                        </LogModule>
                    ) : null}
                </LogModule>
            )
        }

        render(<Harness />)
        log = []

        await act(async () => {
            setShow(false)
        })
        await settle()

        expect(log).toEqual(["GC:unmount", "GC:destroy", "C:unmount", "C:destroy"])
    })

    it("whole-tree removal destroys in full reverse", async () => {
        let setShow!: (value: boolean) => void

        function Harness() {
            const [show, set] = useState(true)
            setShow = set
            return show ? (
                <LogModule root name="A">
                    <LogModule name="B">
                        <LogModule name="C" />
                    </LogModule>
                </LogModule>
            ) : null
        }

        render(<Harness />)
        log = []

        await act(async () => {
            setShow(false)
        })
        await settle()

        expect(log).toEqual(["C:unmount", "C:destroy", "B:unmount", "B:destroy", "A:unmount", "A:destroy"])
    })

    it("mid-tree module rebuild tears down the old resolution and mounts the new one", async () => {
        let rebuildMid: (() => void) | null = null

        function MidControls() {
            rebuildMid = useModuleContext().rebuild
            return null
        }

        render(
            <LogModule root name="A">
                <LogModule name="Mid">
                    <MidControls />
                    <LogModule name="Leaf" />
                </LogModule>
            </LogModule>
        )

        expect(log).toEqual(["A:mount", "Mid:mount", "Leaf:mount"])

        log = []
        await act(async () => {
            rebuildMid?.()
        })
        await settle()

        // The new Mid resolution renders and mounts (its child Leaf rebuilds via the
        // parent-change effect), then the old Mid subtree is torn down in the deferred flush. The old
        // Mid + old Leaf are destroyed, and a fresh Mid + Leaf are mounted; A is untouched.
        expect(log).toContain("Mid:mount")
        expect(log).toContain("Leaf:mount")
        expect(log).toContain("Mid:destroy")
        expect(log).toContain("Leaf:destroy")
        expect(log).not.toContain("A:destroy")
        expect(log).not.toContain("A:mount")
    })

    it("abandoned render: a child throwing during render leaves the parent with no child and nothing mounted", async () => {
        const onError = vi.fn()

        function Throwing(): ReactNode {
            throw new Error("render boom")
        }

        render(
            <LogModule root name="P">
                <ErrorBoundary onError={onError}>
                    <LogModule name="C">
                        <Throwing />
                    </LogModule>
                </ErrorBoundary>
            </LogModule>
        )

        expect(onError).toHaveBeenCalled()
        // Parent mounted; the abandoned child never committed, so it never mounted.
        expect(log).toEqual(["P:mount"])

        log = []
        await settle()
        // Nothing pending to tear down for the abandoned child.
        expect(log).toEqual([])
    })
})
