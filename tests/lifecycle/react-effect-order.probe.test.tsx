import { render } from "@testing-library/react"
import { useEffect, useRef } from "react"
import { describe, expect, it } from "vitest"

import { ModuleProvider } from "../../src/react/providers/ModuleProvider"

// PROBE — documents React's ACTUAL effect/cleanup order in this version as an executable assertion.
//
// The cross-module lifecycle design treats this order as UNTRUSTED INPUT: correctness never
// depends on the relative firing order of effects across the parent/child boundary — React supplies the
// commit/cleanup *signal*, the container-linked tree supplies the *order*. This test exists only to make
// the observed behavior visible; if a future React version flips it, the library is unaffected but this
// note stays honest.
//
// Observed (React 19, this toolchain): mount effects fire BOTTOM-UP (child before parent), but
// unmount cleanups fire PARENT-FIRST (parent before its children) — an asymmetry. If the library tore
// modules down on raw React cleanup order it would destroy parent-before-child (backwards for a scope
// system where children depend on a live parent). This is precisely why the design treats the order as
// untrusted and the container-linked tree owns destroy ordering instead. Sibling effects fire in
// commit/mount (JSX) order — the ONE ordering signal the tree actually consumes.

describe("React effect/cleanup order probe", () => {
    it("fires mount effects child-first but cleanups parent-first (untrusted asymmetry)", () => {
        const order: string[] = []

        function Node({ name, children }: { name: string; children?: React.ReactNode }) {
            useEffect(() => {
                order.push(`${name}:effect`)
                return () => {
                    order.push(`${name}:cleanup`)
                }
            }, [name])
            return <>{children}</>
        }

        const view = render(
            <Node name="parent">
                <Node name="c1" />
                <Node name="c2" />
            </Node>
        )

        // Mount effects: children before parent; siblings in commit order.
        expect(order).toEqual(["c1:effect", "c2:effect", "parent:effect"])

        order.length = 0
        view.unmount()

        // Cleanups: PARENT before children in this React version — the raw order is backwards for
        // destroy, which is exactly why the tree (not React) drives teardown ordering.
        expect(order).toEqual(["parent:cleanup", "c1:cleanup", "c2:cleanup"])
    })

    // PROBE — pins React's unmount sequencing relative to passive (useEffect) cleanups.
    //
    // Conclusion this pins: on unmount, a passive `useEffect` cleanup runs AFTER React has detached refs
    // (mutation phase) and removed the node from the document. So module teardown — which starts from that
    // cleanup (`scheduleTeardown`) plus a `queueMicrotask` — never had live-DOM access at ANY point in this
    // library's history: the DOM is already gone by the time the cleanup fires, before the microtask even
    // schedules. The deferred flush moves nothing across a live-DOM boundary because there was none to
    // cross. Documentation-by-test: correctness must not depend on this; it stays honest if React changes.
    it("runs passive cleanups after ref detach + DOM removal (unmount hooks never see live DOM)", () => {
        const observed: {
            connectedAtEffect: boolean | null
            nodeAtEffect: HTMLDivElement | null
            refAtCleanup: HTMLDivElement | null
            connectedAtCleanup: boolean | null
        } = {
            connectedAtEffect: null,
            nodeAtEffect: null,
            refAtCleanup: null,
            connectedAtCleanup: null,
        }

        function DomProbe() {
            const ref = useRef<HTMLDivElement>(null)
            useEffect(() => {
                // Effect time: the node is mounted and in the document.
                const node = ref.current
                observed.nodeAtEffect = node
                observed.connectedAtEffect = node?.isConnected ?? null
                return () => {
                    // Cleanup time (unmount): record what the ref points to now and whether the
                    // captured node is still attached to the document.
                    observed.refAtCleanup = ref.current
                    observed.connectedAtCleanup = node ? node.isConnected : null
                }
            }, [])
            return <div ref={ref} />
        }

        const view = render(
            <ModuleProvider root>
                <DomProbe />
            </ModuleProvider>
        )

        // At effect time the node was real and connected.
        expect(observed.nodeAtEffect).not.toBeNull()
        expect(observed.connectedAtEffect).toBe(true)

        view.unmount()

        // At passive-cleanup time React had already detached the ref (mutation phase) and removed the
        // node from the DOM — so the cleanup, and any teardown chained off it, sees no live DOM.
        expect(observed.refAtCleanup).toBeNull()
        expect(observed.connectedAtCleanup).toBe(false)
    })
})
