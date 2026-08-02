import { afterEach, describe, expect, it, vi } from "vitest"
import { act, render } from "@testing-library/react"
import { Component, useState, type ReactNode } from "react"

import { Module } from "../../src/core/module/module.js"
import { ModuleProvider } from "../../src/react/providers/ModuleProvider.js"
import { ModuleRegistry } from "../../src/core/providers/module-registry/module-registry.provider.js"
import type { HookCounts } from "../setup/helpers.js"
import { flush, makeApp, makeChild, tracked } from "../setup/helpers.js"
import { Root } from "../setup/react.js"

// Destroy torture.
// ========================================
//
// `destroy()` is the only phase that is asynchronous, the only one that claims a subtree, and the only one
// that can be called out of order by a caller holding a module reference. The five edges below are the ones
// the rest of the suite leaves open:
//
//   1. destroy with NO prior unmount, on a live mounted module and on a mounted subtree;
//   2. two destroys in flight at once, at microtask resolution — not "eventually collapses";
//   3. a descendant destroying itself while an ancestor's destroy is still draining;
//   4. destroy after a mount that threw — the imperative escape hatch, checked for completeness;
//   5. unmount throwing does not cost the destroy phase — imperatively, and through ModuleProvider's
//      `try { unmount() } finally { void destroy() }` cleanup.
//
// Already pinned elsewhere and deliberately not repeated: destroy ORDER (`ordering.test.ts` "destroy"),
// destroy hooks that throw (`errors.test.ts` "destroy", `errors-torture.test.tsx` "destroy errors"),
// sequential and Promise.all repeats (`idempotence.test.ts`), destroy of a module that never mounted
// (`participation.test.ts:122`) and of one that failed init (`errors-torture.test.tsx:54`).

afterEach(() => {
    vi.restoreAllMocks()
})

const ONCE: HookCounts = { init: 1, mount: 1, unmount: 1, destroy: 1 }
/** Mounted, then destroyed with no unmount in between. */
const UNMOUNT_SKIPPED: HookCounts = { init: 1, mount: 1, unmount: 0, destroy: 1 }

// 1. Destroy while still mounted
// ========================================

describe("destroy while still mounted", () => {
    /**
     * MEASURED SEMANTIC — destroy runs the destroy phase and nothing else, but the flags still tell the truth.
     *
     * `ModuleLifecycle.destroy()` claims the subtree and calls `#runDestroyPhase()`; there is no
     * unmount-if-mounted branch anywhere in it. An instance destroyed straight out of a mounted module is
     * therefore notified of its death without ever having been notified of its retirement: `onModuleUnmount`
     * is skipped for good, not deferred, and the module's own `onModuleUnmount` goes with it.
     *
     * The state flags are the other half, and they are NOT derived from the hooks. `#claimSubtree` resets
     * `#committed` and `#mounted` together behind the detach, so the invariant a caller can rely on is:
     * a claimed module reports neither committed nor mounted, whether or not an unmount phase ever ran.
     * Hooks fired and flags cleared are separate facts here — this test is where they come apart.
     *
     * React never reaches this state: `ModuleProvider`'s cleanup always unmounts before it destroys. This is
     * purely the imperative caller's rope.
     */
    it("skips the unmount phase for every instance while still clearing `mounted`", async () => {
        const log: string[] = []
        const service = tracked(log, "A")
        const other = tracked(log, "B")
        const module = makeApp({
            providers: [service, other],
            onModuleUnmount: () => log.push("module:unmount"),
            onModuleDestroy: () => log.push("module:destroy"),
        })
        module.mount()
        log.length = 0

        await module.destroy()

        // Destroy phase only — reversed instances, then the module hook. No unmount entry of any kind.
        expect(log).toEqual(["B:destroy", "A:destroy", "module:destroy"])
        expect(service.counts).toEqual(UNMOUNT_SKIPPED)
        expect(other.counts).toEqual(UNMOUNT_SKIPPED)

        // Claimed and destroyed, still initialized, and honestly no longer mounted — even though nothing
        // ever ran an unmount phase on it.
        expect(module.claimed).toBe(true)
        expect(module.initialized).toBe(true)
        expect(module.mounted).toBe(false)

        // A late unmount signal cannot repair it — the `#destroyed` guard is first in `unmount()`.
        log.length = 0
        module.unmount()
        expect(log).toEqual([])
        expect(service.counts).toEqual(UNMOUNT_SKIPPED)
    })

    it("claims a mounted three-level subtree and destroys it leaf-first, detaching every level", async () => {
        const log: string[] = []
        const root = tracked(log, "P")
        const middle = tracked(log, "C")
        const leaf = tracked(log, "G")

        const app = makeApp({ providers: [root] })
        const child = makeChild(app, { providers: [middle] })
        const grandchild = makeChild(child, { providers: [leaf] })
        grandchild.mount()
        child.mount()
        app.mount()

        // Fully live and fully linked before the destroy.
        expect([app.mounted, child.mounted, grandchild.mounted]).toEqual([true, true, true])
        expect(app.children.size).toBe(1)
        expect(child.children.size).toBe(1)
        log.length = 0

        await app.destroy()

        // LIFO across the whole subtree, and not one unmount hook anywhere in it.
        expect(log).toEqual(["G:destroy", "C:destroy", "P:destroy"])
        expect([root.counts, middle.counts, leaf.counts]).toEqual([
            UNMOUNT_SKIPPED,
            UNMOUNT_SKIPPED,
            UNMOUNT_SKIPPED,
        ])

        // `#claimSubtree` detaches each node as it claims it, so nothing is reachable from the registry —
        // the point of doing the claim synchronously before any hook awaits. Every level takes the same
        // flag reset with it, so no destroyed node anywhere in the subtree still reports itself mounted.
        expect([app.claimed, child.claimed, grandchild.claimed]).toEqual([true, true, true])
        expect([app.mounted, child.mounted, grandchild.mounted]).toEqual([false, false, false])
        expect(app.children.size).toBe(0)
        expect(child.children.size).toBe(0)
        expect(app.container.resolve(ModuleRegistry).descendants()).toEqual([])
    })

    it("detaches a mounted child from a parent that stays alive, and the parent's later unmount misses it", async () => {
        const log: string[] = []
        const parentService = tracked(log, "P")
        const childService = tracked(log, "C")
        const parent = makeApp({ providers: [parentService] })
        const child = makeChild(parent, { providers: [childService] })
        child.mount()
        parent.mount()
        log.length = 0

        await child.destroy()

        expect(log).toEqual(["C:destroy"])
        expect(parent.children.size).toBe(0)
        expect(parentService.counts).toEqual({ init: 1, mount: 1, unmount: 0, destroy: 0 })

        // The parent is untouched and still mounted; its own teardown walks a subtree the child has left.
        log.length = 0
        parent.unmount()
        await parent.destroy()

        expect(log).toEqual(["P:unmount", "P:destroy"])
        expect(childService.counts).toEqual(UNMOUNT_SKIPPED)
        expect(parentService.counts).toEqual(ONCE)
    })

    /**
     * The knock-on of `#mounted` falling in the claim, pinned because it is load-bearing.
     *
     * A destroyed module stays `initialized`, and the child-construction guard reads `parent.initialized` —
     * so building a child under a corpse is allowed, and always was. What stops it going live is the mount
     * gate one level down, `if (!parent || parent.mounted)`, and that gate only bites because the claim now
     * clears `#mounted`. Before the flag fell with the claim, a parent destroyed straight out of a mounted
     * state still reported `mounted === true`, and this child would have mounted itself into a live subtree
     * hanging off a destroyed module.
     */
    it("does not mount a child created under a destroyed parent", async () => {
        const log: string[] = []
        const parent = makeApp({ providers: [tracked(log, "P")] })
        parent.mount()
        await parent.destroy()

        // The gate's premise: destroyed straight from mounted, so no unmount phase ever ran here.
        expect(parent.claimed).toBe(true)
        expect(parent.mounted).toBe(false)
        expect(parent.initialized).toBe(true)
        log.length = 0

        const childService = tracked(log, "C")
        const child = new Module(parent, { providers: [childService] })
        child.init()
        child.mount()

        // The refusal is the parent gate, not the `#initialized` guard: init ran in full, mount did not.
        expect(child.initialized).toBe(true)
        expect(child.mounted).toBe(false)
        expect(childService.counts).toEqual({ init: 1, mount: 0, unmount: 0, destroy: 0 })
        expect(log).toEqual(["C:ctor", "C:init"])

        // MEASURED: `attach()` runs BEFORE the gate, so the gated child is still linked to the corpse — it
        // is reachable and unmounted, not unreachable. Nothing walks it (the parent is claimed and its
        // cascades are spent), so it is inert; the caller that built it owns getting rid of it.
        expect(parent.children.size).toBe(1)

        // Which it can: the child is still independently claimable — destroy runs its hooks and detaches it.
        log.length = 0
        await child.destroy()

        expect(log).toEqual(["C:destroy"])
        expect(childService.counts).toEqual({ init: 1, mount: 0, unmount: 0, destroy: 1 })
        expect(child.claimed).toBe(true)
        expect(parent.children.size).toBe(0)
    })
})

// 2. Two destroys in flight
// ========================================

describe("two destroys in flight", () => {
    /**
     * MEASURED SEMANTIC — the second call resolves on a microtask, long before the first finishes.
     *
     * `destroy()` is `async`, so everything up to its first `await` runs synchronously: `#claimSubtree()`
     * and the `node.#destroyed = true` loop are both done by the time the first call has returned its
     * promise. The second call therefore takes the `if (this.#destroyed) return` exit and resolves
     * immediately — it is a "somebody else has this" answer, NOT a join on the work in flight.
     *
     * Practical consequence: `await module.destroy()` only means "destroyed" for the caller that won the
     * claim. A second caller awaiting it gets control back while hooks are still draining, and there is no
     * handle anywhere that lets it wait for them. `idempotence.test.ts:106` pins the same collapse across a
     * 5ms sleep; the point here is that it is a microtask, and that the settle ORDER is inverted.
     */
    it("resolves the second call before the first has run a single destroy hook", async () => {
        const log: string[] = []
        const first = tracked(log, "A", { destroyDelay: 20 })
        const second = tracked(log, "B", { destroyDelay: 20 })
        const module = makeApp({
            providers: [first, second],
            onModuleDestroy: () => log.push("module:destroy"),
        })
        module.mount()
        module.unmount()
        log.length = 0

        const settled: string[] = []
        const winner = module.destroy().then(() => settled.push("winner"))
        const loser = module.destroy().then(() => settled.push("loser"))

        await loser

        // The second promise is already settled while the first has not reached one hook.
        expect(settled).toEqual(["loser"])
        expect(log).toEqual([])

        await winner

        // Reversed order, each hook exactly once across BOTH calls, and the loser settled first.
        expect(settled).toEqual(["loser", "winner"])
        expect(log).toEqual(["B:destroy", "A:destroy", "module:destroy"])
        expect(first.counts).toEqual(ONCE)
        expect(second.counts).toEqual(ONCE)
    })

    it("duplicates nothing when the second call targets a child of the first call's subtree", async () => {
        const log: string[] = []
        const parentService = tracked(log, "P", { destroyDelay: 15 })
        const childService = tracked(log, "C", { destroyDelay: 15 })
        const parent = makeApp({ providers: [parentService] })
        const child = makeChild(parent, { providers: [childService] })
        child.mount()
        parent.mount()
        parent.unmount()
        log.length = 0

        const outer = parent.destroy()
        const inner = child.destroy()

        // The child was claimed and marked destroyed by the parent's synchronous head, so its own call is a
        // no-op that resolves ahead of the work.
        await inner
        expect(log).toEqual([])

        await outer
        expect(log).toEqual(["C:destroy", "P:destroy"])
        expect(parentService.counts).toEqual(ONCE)
        expect(childService.counts).toEqual(ONCE)
    })
})

// 3. Destroy during an ancestor's destroy
// ========================================

describe("destroy during an ancestor's destroy", () => {
    it("is a no-op when a child destroys itself while the ancestor's drain is mid-flight", async () => {
        const log: string[] = []
        const parentService = tracked(log, "P")
        const childService = tracked(log, "C", { destroyDelay: 40 })
        const parent = makeApp({ providers: [parentService] })
        const child = makeChild(parent, { providers: [childService] })
        child.mount()
        parent.mount()
        parent.unmount()
        log.length = 0

        const ancestor = parent.destroy()

        // Land inside the child's own 40ms destroy hook: the claim is done, the drain is not.
        await new Promise((resolve) => setTimeout(resolve, 10))
        expect(log).toEqual([])

        // Resolves rather than throwing, and adds nothing.
        await expect(child.destroy()).resolves.toBeUndefined()
        expect(log).toEqual([])

        await ancestor

        expect(log).toEqual(["C:destroy", "P:destroy"])
        expect(parentService.counts).toEqual(ONCE)
        expect(childService.counts).toEqual(ONCE)
    })

    /**
     * MEASURED SEMANTIC — a re-entrant `module.destroy()` from inside a destroy hook cannot deadlock.
     *
     * The hook is being awaited by `#runDestroyPhase`, which is being awaited by the very `destroy()` the
     * hook calls again. That would be a self-join if the guard were a promise; because it is the synchronous
     * `#destroyed` flag — already set before the first hook ran — the re-entrant call returns an
     * already-resolved promise and the hook completes normally. The escaping-hatch shape (a service that
     * tears down its own module) is therefore safe rather than fatal.
     */
    it("does not deadlock when a provider's own destroy hook calls module.destroy()", async () => {
        const log: string[] = []
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
        const parentService = tracked(log, "P")
        const parent = makeApp({ providers: [parentService] })
        const child = makeChild(parent, {
            providers: [
                {
                    provide: Symbol("self-destructing"),
                    useFactory: (owner: Module) => ({
                        onModuleDestroy: async () => {
                            log.push("R:enter")
                            await owner.destroy()
                            log.push("R:exit")
                        },
                    }),
                    inject: [Module],
                },
            ],
        })
        child.mount()
        parent.mount()
        parent.unmount()
        log.length = 0

        await parent.destroy()

        expect(log).toEqual(["R:enter", "R:exit", "P:destroy"])
        expect(parentService.counts).toEqual(ONCE)
        expect(errorSpy).not.toHaveBeenCalled()
    })
})

// 4. Destroy after a failed mount
// ========================================

describe("destroy after a failed mount", () => {
    /**
     * `errors-torture.test.tsx:129` establishes that the escape hatch exists at all (one provider's destroy
     * ran). The question here is whether it is COMPLETE: a mount that aborted halfway leaves instances in
     * three different states — mounted, throwing, never reached — and all three are still in `#instances`,
     * so all three must be destroyed. They are.
     */
    it("gives every instance its destroy hook, whether it mounted, threw, or was never reached", async () => {
        const log: string[] = []
        const mounted = tracked(log, "A")
        const thrower = tracked(log, "B", { throwOn: "mount" })
        const unreached = tracked(log, "C")
        const app = makeApp()
        app.mount()

        const module = makeChild(app, {
            providers: [mounted, thrower, unreached],
            onModuleDestroy: () => log.push("module:destroy"),
        })
        log.length = 0

        expect(() => module.mount()).toThrow("B mount")
        expect(log).toEqual(["A:mount"])
        log.length = 0

        await module.destroy()

        // Reverse declaration order across the whole participant set, module hook last.
        expect(log).toEqual(["C:destroy", "B:destroy", "A:destroy", "module:destroy"])
        expect(mounted.counts).toEqual({ init: 1, mount: 1, unmount: 0, destroy: 1 })
        expect(thrower.counts).toEqual({ init: 1, mount: 0, unmount: 0, destroy: 1 })
        expect(unreached.counts).toEqual({ init: 1, mount: 0, unmount: 0, destroy: 1 })
    })

    it("leaves the failed module detached and makes a second destroy a no-op", async () => {
        const log: string[] = []
        const service = tracked(log, "A")
        const app = makeApp()
        app.mount()

        const module = makeChild(app, { providers: [service, tracked(log, "B", { throwOn: "mount" })] })
        expect(() => module.mount()).toThrow("B mount")

        // mount()'s catch already detached it; destroy's claim must not resurrect the link.
        expect(app.children.size).toBe(0)
        await module.destroy()
        expect(app.children.size).toBe(0)
        expect(module.claimed).toBe(true)

        log.length = 0
        await expect(module.destroy()).resolves.toBeUndefined()
        expect(log).toEqual([])
        expect(service.counts.destroy).toBe(1)

        // And the live App above it is untouched by any of it.
        expect(app.mounted).toBe(true)
        app.unmount()
        await app.destroy()
        expect(service.counts.destroy).toBe(1)
    })
})

// 5. Unmount errors do not cost the destroy phase
// ========================================

type BoundaryProps = { children?: ReactNode; onError?: (error: unknown) => void }

class Boundary extends Component<BoundaryProps, { error: unknown }> {
    state: { error: unknown } = { error: null }

    static getDerivedStateFromError(error: unknown): { error: unknown } {
        return { error }
    }

    componentDidCatch(error: unknown): void {
        this.props.onError?.(error)
    }

    render(): ReactNode {
        return this.state.error ? <span data-testid="fallback">caught</span> : this.props.children
    }
}

describe("unmount errors do not cost the destroy phase", () => {
    it("imperative: every destroy hook still runs after unmount threw an AggregateError", async () => {
        const log: string[] = []
        const before = tracked(log, "A")
        const thrower = tracked(log, "B", { throwOn: "unmount" })
        const after = tracked(log, "C")
        const module = makeApp({
            providers: [before, thrower, after],
            onModuleUnmount: () => log.push("module:unmount"),
            onModuleDestroy: () => log.push("module:destroy"),
        })
        module.mount()
        log.length = 0

        let caught: unknown
        try {
            module.unmount()
        } catch (error) {
            caught = error
        }

        expect(caught).toBeInstanceOf(AggregateError)
        expect((caught as AggregateError).errors.map((error) => (error as Error).message)).toEqual(["B unmount"])
        expect(log).toEqual(["C:unmount", "A:unmount", "module:unmount"])
        log.length = 0

        // The failed unmount changes nothing about the destroy phase: same participant set, same order.
        await module.destroy()

        expect(log).toEqual(["C:destroy", "B:destroy", "A:destroy", "module:destroy"])
        expect(before.counts).toEqual(ONCE)
        expect(after.counts).toEqual(ONCE)
        expect(thrower.counts).toEqual({ init: 1, mount: 1, unmount: 0, destroy: 1 })
    })

    /**
     * MEASURED SEMANTIC — the React path, and where the AggregateError lands.
     *
     * `ModuleProvider`'s cleanup is `try { module.unmount() } finally { void module.destroy() }`. The finally
     * is what makes a throwing `onModuleUnmount` survivable: the module is still destroyed, so no instance is
     * left holding resources, and the error is then free to leave the cleanup.
     *
     * Where it lands, measured on React 19.2 + jsdom, depends on whether a boundary is in the deletion path:
     *
     *   * no boundary — the AggregateError is RETHROWN out of the commit, i.e. out of `unmount()` / `act()`.
     *     `console.error` is not called and no window `error` event fires; the throw itself is the report.
     *   * boundary above the deleted subtree — React routes it to `componentDidCatch`, logs its own
     *     "The above error occurred in <ModuleProvider>" line to `console.error`, and the boundary swaps in
     *     its fallback. A throwing unmount hook therefore takes the boundary's whole subtree down with it.
     *
     * Either way the destroy phase is already complete-in-flight by the time the error is visible, because
     * the finally ran before the throw propagated.
     */
    it("React: destroys the module even though unmount threw, and rethrows out of the commit", async () => {
        const log: string[] = []
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
        const survivor = tracked(log, "A")
        const thrower = tracked(log, "B", { throwOn: "unmount" })

        const { unmount } = render(
            <Root>
                <ModuleProvider providers={[survivor, thrower]}>
                    <div />
                </ModuleProvider>
            </Root>
        )
        log.length = 0

        expect(() => unmount()).toThrow(AggregateError)
        await flush()

        // The finally ran: both instances got their destroy even though the unmount walk failed.
        expect(log).toEqual(["A:unmount", "B:destroy", "A:destroy"])
        expect(survivor.counts).toEqual(ONCE)
        expect(thrower.counts).toEqual({ init: 1, mount: 1, unmount: 0, destroy: 1 })

        // MEASURED: with no boundary in the path the throw IS the report — React logs nothing itself.
        expect(errorSpy).not.toHaveBeenCalled()
    })

    it("React: an ErrorBoundary above the removed subtree receives the AggregateError, destroy still completes", async () => {
        const log: string[] = []
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
        const survivor = tracked(log, "A")
        const thrower = tracked(log, "B", { throwOn: "unmount" })
        const caught: unknown[] = []
        let show: (visible: boolean) => void = () => {}

        function Harness(): ReactNode {
            const [visible, setVisible] = useState(true)
            show = setVisible
            return (
                <Root>
                    <Boundary onError={(error) => caught.push(error)}>
                        {visible ? (
                            <ModuleProvider providers={[survivor, thrower]}>
                                <div />
                            </ModuleProvider>
                        ) : null}
                    </Boundary>
                </Root>
            )
        }

        const { getByTestId } = render(<Harness />)
        log.length = 0

        // Does NOT escape the act — the boundary is in the deletion path and swallows it.
        await act(async () => show(false))
        await flush()

        expect(caught).toHaveLength(1)
        expect(caught[0]).toBeInstanceOf(AggregateError)
        expect((caught[0] as AggregateError).errors.map((error) => (error as Error).message)).toEqual(["B unmount"])
        expect(getByTestId("fallback")).toBeInTheDocument()

        // Same completeness as the no-boundary path.
        expect(log).toEqual(["A:unmount", "B:destroy", "A:destroy"])
        expect(survivor.counts).toEqual(ONCE)
        expect(thrower.counts).toEqual({ init: 1, mount: 1, unmount: 0, destroy: 1 })

        // React reports the caught commit error itself, so there IS a console line on this path.
        expect(errorSpy).toHaveBeenCalled()
    })

    it("React: a throwing module unmount hook does not stop the parent module's own teardown", async () => {
        const log: string[] = []
        vi.spyOn(console, "error").mockImplementation(() => {})
        const parentService = tracked(log, "P")
        const childService = tracked(log, "C")

        const { unmount } = render(
            <Root>
                <ModuleProvider providers={[parentService]}>
                    <ModuleProvider
                        providers={[childService]}
                        onModuleUnmount={() => {
                            throw new Error("hook unmount boom")
                        }}
                    >
                        <div />
                    </ModuleProvider>
                </ModuleProvider>
            </Root>
        )
        log.length = 0

        expect(() => unmount()).toThrow(AggregateError)
        await flush()

        // Effects clean up child-first. The child's cleanup throws AFTER its finally scheduled the destroy,
        // and React keeps walking the deletion — so the parent module completes both of its phases too.
        expect(log).toEqual(["C:unmount", "P:unmount", "C:destroy", "P:destroy"])
        expect(parentService.counts).toEqual(ONCE)
        expect(childService.counts).toEqual(ONCE)
    })
})
