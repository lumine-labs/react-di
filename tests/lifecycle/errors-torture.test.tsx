import { afterEach, describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"
import { Component, type ReactNode } from "react"

import { App, Module } from "../../src/core/module/module.js"
import { ModuleProvider } from "../../src/react/providers/ModuleProvider.js"
import { makeApp, makeChild, phase, tracked } from "../setup/helpers.js"
import { Root } from "../setup/react.js"

// The error matrix.
// ========================================
//
// `errors.test.ts` pins WHERE an error goes (throw / console.error). This suite pins the other half,
// per phase:
//
//   * what the MODULE's own state becomes afterwards — `initialized`, `mounted`, and what a later phase
//     signal does to a module that failed an earlier one;
//   * what crosses a module boundary — a child's failure reaching (or not reaching) its parent's phases;
//   * what the React error boundary actually receives.
//
// Continuation semantics as measured, per phase (remaining PROVIDER hooks in the failing module):
//
//   init     — abort. The throw leaves the phase and the module never reaches `initialized`.
//   mount    — abort, detach, reset `#committed`, rethrow the ORIGINAL error. Hooks that already ran keep
//              their side effects: the mount phase is one effect setup, and React leaks a throwing setup's
//              work too (subscribe, then throw — the subscription stays). Undoing that is the developer's
//              job. The one thing the library owes is severing the pre-phase attachment, so no dead module
//              stays reachable from a live App's registry.
//   unmount  — continue: every hook runs, and one AggregateError of the failures is thrown at the end.
//   destroy  — continue: destroy logs instead of throwing, and clears its instances either way.

afterEach(() => {
    vi.restoreAllMocks()
})

// init
// ========================================

describe("init errors", () => {
    it("abandons the phase and never reaches initialized without a handler", () => {
        const log: string[] = []
        const first = tracked(log, "A")
        const last = tracked(log, "C")
        const app = new App({ providers: [first, tracked(log, "B", { throwOn: "init" }), last] })

        expect(() => app.init()).toThrow("B init")

        expect(phase(log, "init")).toEqual(["A:init"])
        expect([first.counts.init, last.counts.init]).toEqual([1, 0])
        expect(app.initialized).toBe(false)
        expect(app.mounted).toBe(false)
    })

    it("leaves a module that failed init inert and childless, but still destroyable", async () => {
        const log: string[] = []
        const app = new App({
            providers: [tracked(log, "A"), tracked(log, "B", { throwOn: "init" }), tracked(log, "C")],
        })
        expect(() => app.init()).toThrow("B init")
        log.length = 0

        // Every later phase gates on `initialized`, so the signals are inert...
        app.mount()
        app.unmount()
        expect(log).toEqual([])
        expect(app.mounted).toBe(false)

        // ...and a child cannot be built off it at all — the un-armed-lifecycle guard from the spec.
        expect(() => new Module(app, {})).toThrow(/un-initialized parent/)

        // ...but destroy is NOT gated on init: collection ran before the phase did, so every instance the
        // module built still gets its destroy. Characterisation, and the reason a failed init does not leak.
        await app.destroy()
        expect(log).toEqual(["C:destroy", "B:destroy", "A:destroy"])
    })
})

// mount
// ========================================

describe("mount errors", () => {
    it("abandons the remaining mount hooks and leaves the module unmounted without a handler", () => {
        const log: string[] = []
        const last = tracked(log, "C")
        const module = makeApp({ providers: [tracked(log, "A"), tracked(log, "B", { throwOn: "mount" }), last] })
        log.length = 0

        expect(() => module.mount()).toThrow("B mount")

        expect(log).toEqual(["A:mount"])
        expect(last.counts.mount).toBe(0)
        expect(module.mounted).toBe(false)
    })

    it("detaches and rethrows the original error, leaking what already mounted", async () => {
        const log: string[] = []
        const first = tracked(log, "A")
        const app = makeApp()
        app.mount()

        const module = makeChild(app, { providers: [first, tracked(log, "B", { throwOn: "mount" })] })
        log.length = 0

        let caught: unknown
        try {
            module.mount()
        } catch (error) {
            caught = error
        }

        // The ORIGINAL error, raw — never wrapped, never aggregated.
        expect(caught).toBeInstanceOf(Error)
        expect((caught as Error).message).toBe("B mount")

        // `attach()` runs before the phase, so the catch has to undo it: a dead module left in a live App's
        // registry would be a permanently reachable corpse. This is the one thing the library owes here.
        expect(app.children.has(module)).toBe(false)
        expect(app.children.size).toBe(0)
        expect(module.mounted).toBe(false)

        // A mounted and never gets its unmount. Same class of leak as a `useEffect` setup that subscribes
        // and then throws — the subscription stays, and undoing it is the developer's job, not React's.
        // `#committed` is rolled back with the detach, so a fresh mount() would re-attach; that is
        // undefended rather than blessed.
        expect(first.counts).toEqual({ init: 1, mount: 1, unmount: 0, destroy: 0 })

        // The imperative escape hatch: `#destroyed` is deliberately not set, so a caller still holding the
        // module can run its destroy hooks.
        await module.destroy()
        expect(first.counts.destroy).toBe(1)
    })

    it("severs the island when a child's mount throws, leaving healthy siblings their own cleanup", async () => {
        const log: string[] = []
        const parentService = tracked(log, "P")
        const healthy = tracked(log, "C1")
        const app = makeApp()
        app.mount()

        const parent = makeChild(app, { providers: [parentService] })
        const first = makeChild(parent, { providers: [healthy] })
        const second = makeChild(parent, { providers: [tracked(log, "C2", { throwOn: "mount" })] })
        first.mount()
        second.mount()
        log.length = 0

        expect(() => parent.mount()).toThrow("C2 mount")

        // The throw unwinds into the INITIATING mount, so `parent` is what rolls back — which detaches the
        // whole island from the App in one cut. No zombie is reachable from the live registry.
        expect(app.children.size).toBe(0)

        // Neither the parent nor the healthy child gets an unmount out of the failure itself: React parity.
        expect(parentService.counts).toEqual({ init: 1, mount: 1, unmount: 0, destroy: 0 })
        expect(healthy.counts).toEqual({ init: 1, mount: 1, unmount: 0, destroy: 0 })

        // But effects run child-first, so a healthy child module already registered its own ModuleProvider
        // cleanup — that still fires and completes it properly. Simulate the pair of signals it would send.
        first.unmount()
        await first.destroy()

        expect(healthy.counts).toEqual({ init: 1, mount: 1, unmount: 1, destroy: 1 })
    })
})

// unmount
// ========================================

describe("unmount errors", () => {
    it("runs every remaining unmount hook and ends honestly unmounted", () => {
        const log: string[] = []
        const first = tracked(log, "A")
        const module = makeApp({ providers: [first, tracked(log, "B", { throwOn: "unmount" }), tracked(log, "C")] })
        module.mount()
        log.length = 0

        let caught: unknown
        try {
            module.unmount()
        } catch (error) {
            caught = error
        }

        // Fail-safe: the walk continues past B, so A still gets its unmount.
        expect(log).toEqual(["C:unmount", "A:unmount"])
        expect(first.counts.unmount).toBe(1)
        expect(caught).toBeInstanceOf(AggregateError)
        expect((caught as AggregateError).errors.map((error) => (error as Error).message)).toEqual(["B unmount"])
        // `#mounted = false` runs in a finally, so the module does not end up claiming to be mounted.
        expect(module.mounted).toBe(false)
    })

    it("still unmounts the children before the parent's own hooks run", () => {
        const log: string[] = []
        const childService = tracked(log, "C")
        const parent = makeApp({ providers: [tracked(log, "P", { throwOn: "unmount" })] })
        const child = makeChild(parent, { providers: [childService] })
        child.mount()
        parent.mount()
        log.length = 0

        expect(() => parent.unmount()).toThrow(AggregateError)

        // Children go first in the unmount walk, so they are already done when the parent's hooks fail.
        expect(log).toEqual(["C:unmount"])
        expect(childService.counts.unmount).toBe(1)
    })

    it("keeps unmounting the parent after a child's unmount error", () => {
        const log: string[] = []
        const parentService = tracked(log, "P")
        const survivingSibling = tracked(log, "C2")
        const parent = makeApp({ providers: [parentService] })
        const first = makeChild(parent, { providers: [tracked(log, "C1", { throwOn: "unmount" })] })
        const second = makeChild(parent, { providers: [survivingSibling] })
        first.mount()
        second.mount()
        parent.mount()
        log.length = 0

        let caught: unknown
        try {
            parent.unmount()
        } catch (error) {
            caught = error
        }

        // Siblings unmount in reverse attach order; C1 throws, and the walk still reaches the parent's own
        // phase rather than abandoning it.
        expect(log).toEqual(["C2:unmount", "P:unmount"])
        expect(survivingSibling.counts.unmount).toBe(1)
        expect(parentService.counts.unmount).toBe(1)
        expect(caught).toBeInstanceOf(AggregateError)
        expect((caught as AggregateError).errors.map((error) => (error as Error).message)).toEqual(["C1 unmount"])
        expect(parent.mounted).toBe(false)
    })
})

// destroy
// ========================================

describe("destroy errors", () => {
    it("destroys the parent after a child's destroy hook throws", async () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
        const log: string[] = []
        const parentService = tracked(log, "P")
        const parent = makeApp({ providers: [parentService] })
        const child = makeChild(parent, { providers: [tracked(log, "C", { throwOn: "destroy" })] })
        child.mount()
        parent.mount()
        parent.unmount()
        log.length = 0

        await expect(parent.destroy()).resolves.toBeUndefined()

        // The child's destroy phase is a node in the parent's claimed subtree; its failure is reported and
        // the walk moves on to the next node.
        expect(log).toEqual(["P:destroy"])
        expect(parentService.counts.destroy).toBe(1)
        expect(errorSpy).toHaveBeenCalledTimes(1)
        expect(errorSpy.mock.calls[0]?.[0]).toBe("module.destroy")
        expect((errorSpy.mock.calls[0]?.[1] as Error).message).toBe("C destroy")
    })

    it("keeps destroying a whole three-level tree when the middle level throws", async () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
        const log: string[] = []
        const root = tracked(log, "P")
        const leaf = tracked(log, "G")

        const app = makeApp({ providers: [root] })
        const middle = makeChild(app, { providers: [tracked(log, "C", { throwOn: "destroy" })] })
        const grandchild = makeChild(middle, { providers: [leaf] })
        grandchild.mount()
        middle.mount()
        app.mount()
        app.unmount()
        log.length = 0

        await app.destroy()

        expect(log).toEqual(["G:destroy", "P:destroy"])
        expect([leaf.counts.destroy, root.counts.destroy]).toEqual([1, 1])
        expect(errorSpy).toHaveBeenCalledTimes(1)
    })
})

// React
// ========================================

type BoundaryProps = { onError: (error: unknown) => void; children?: ReactNode }

class Boundary extends Component<BoundaryProps, { failed: boolean }> {
    constructor(props: BoundaryProps) {
        super(props)
        this.state = { failed: false }
    }

    static getDerivedStateFromError(): { failed: boolean } {
        return { failed: true }
    }

    componentDidCatch(error: unknown): void {
        this.props.onError(error)
    }

    render(): ReactNode {
        return this.state.failed ? "failed" : this.props.children
    }
}

describe("the React boundary", () => {
    it("receives an init error from render", () => {
        vi.spyOn(console, "error").mockImplementation(() => {})
        const log: string[] = []
        const caught: unknown[] = []
        const last = tracked(log, "C")

        const { container } = render(
            <Root>
                <Boundary onError={(error) => caught.push(error)}>
                    <ModuleProvider
                        providers={[tracked(log, "A"), tracked(log, "B", { throwOn: "init" }), last]}
                    >
                        <div />
                    </ModuleProvider>
                </Boundary>
            </Root>
        )

        // ModuleProvider inits inside the state initializer, so the error is a plain render throw and the
        // nearest boundary is what sees it — the reason 0.5.0 moved app init out of the constructor.
        expect(caught.map((error) => (error as Error).message)).toEqual(["B init"])
        expect(last.counts.init).toBe(0)
        expect(container.textContent).toBe("failed")
    })

    /**
     * CHARACTERISATION — a boundary INSIDE the app cannot catch a first-commit mount error.
     *
     * React runs effects child-first, so a scoped module's own effect finds its parent unmounted and gates.
     * The whole tree is then mounted by the App's effect, which lives in `AppProvider` — above any boundary
     * a test (or an app) puts inside it. The throw therefore unwinds past the inner boundary and out of the
     * render. An inner boundary is only in the path for errors raised during render (init) or for modules
     * that mount on a LATER commit, where their own effect drives the cascade.
     */
    it("does not catch a first-commit mount error in a boundary nested inside the app", () => {
        vi.spyOn(console, "error").mockImplementation(() => {})
        const log: string[] = []
        const caught: unknown[] = []

        expect(() =>
            render(
                <Root>
                    <Boundary onError={(error) => caught.push(error)}>
                        <ModuleProvider providers={[tracked(log, "A"), tracked(log, "B", { throwOn: "mount" })]}>
                            <div />
                        </ModuleProvider>
                    </Boundary>
                </Root>
            )
        ).toThrow("B mount")

        expect(caught).toEqual([])
        expect(phase(log, "mount")).toEqual(["A:mount"])
    })

    it("receives a first-commit mount error in a boundary wrapping the app", () => {
        vi.spyOn(console, "error").mockImplementation(() => {})
        const log: string[] = []
        const caught: unknown[] = []
        const last = tracked(log, "C")

        const { container } = render(
            <Boundary onError={(error) => caught.push(error)}>
                <Root>
                    <ModuleProvider providers={[tracked(log, "A"), tracked(log, "B", { throwOn: "mount" }), last]}>
                        <div />
                    </ModuleProvider>
                </Root>
            </Boundary>
        )

        expect(caught.map((error) => (error as Error).message)).toEqual(["B mount"])
        expect(phase(log, "mount")).toEqual(["A:mount"])
        expect(last.counts.mount).toBe(0)
        expect(container.textContent).toBe("failed")
    })

    it("receives a later-commit mount error in a boundary nested inside the app", () => {
        vi.spyOn(console, "error").mockImplementation(() => {})
        const log: string[] = []
        const caught: unknown[] = []

        function Tree({ showModule }: { showModule: boolean }): ReactNode {
            return (
                <Root>
                    <Boundary onError={(error) => caught.push(error)}>
                        {showModule ? (
                            <ModuleProvider providers={[tracked(log, "A"), tracked(log, "B", { throwOn: "mount" })]}>
                                <div />
                            </ModuleProvider>
                        ) : null}
                    </Boundary>
                </Root>
            )
        }

        const { rerender } = render(<Tree showModule={false} />)
        rerender(<Tree showModule />)

        // The app is already mounted, so this module's own effect drives its mount — and the inner boundary
        // is in that path.
        expect(caught.map((error) => (error as Error).message)).toEqual(["B mount"])
        expect(phase(log, "mount")).toEqual(["A:mount"])
    })
})
