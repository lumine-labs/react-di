import { act, render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useState, type ReactNode } from "react"

import { decorate, Injectable } from "../../src/container/decorators.js"
import { App, Module } from "../../src/core/module/module.js"
import { AppProvider } from "../../src/react/providers/AppProvider.js"
import { ModuleProvider } from "../../src/react/providers/ModuleProvider.js"
import { useModuleContext, useModuleRebuild } from "../../src/react/hooks/useModuleContext.js"
import { useResolveSafe } from "../../src/react/hooks/useResolve.js"
import type { Provider } from "../../src/types.js"
import { flush, type HookCounts } from "../setup/helpers.js"

// Swapping the App under a live tree
// ========================================
//
// `<AppProvider app={…}>` takes an instance the owner made, and nothing stops that prop from changing. The
// App is the one module React does not own — AppProvider mounts and unmounts it but NEVER destroys it — so
// a swap crosses the boundary between "React's business" and "the owner's business", and the two halves
// have different rules. This file pins what actually happens, in both directions.
//
// The short version, measured: swapping FORWARD to a fresh App works completely. Swapping BACK to an App
// that has already been through an AppProvider does not, and cannot — `mount()` refuses a module that has
// been committed once, and only a destroy clears that flag. Those tests document the failure mode, they do
// not bless it.

// Per-generation tracking
// ========================================

type Life = { gen: number; counts: HookCounts }

type Generational = {
    provider: Provider
    /** One entry per constructed instance, in construction order. */
    lives: Life[]
}

function generational(log: string[], label: string): Generational {
    const lives: Life[] = []

    const Service = class {
        readonly life: Life

        constructor() {
            this.life = { gen: lives.length + 1, counts: { init: 0, mount: 0, unmount: 0, destroy: 0 } }
            lives.push(this.life)
            log.push(`${label}#${this.life.gen}:ctor`)
        }

        onModuleInit(): void {
            this.life.counts.init++
            log.push(`${label}#${this.life.gen}:init`)
        }

        onModuleMount(): void {
            this.life.counts.mount++
            log.push(`${label}#${this.life.gen}:mount`)
        }

        onModuleUnmount(): void {
            this.life.counts.unmount++
            log.push(`${label}#${this.life.gen}:unmount`)
        }

        async onModuleDestroy(): Promise<void> {
            this.life.counts.destroy++
            log.push(`${label}#${this.life.gen}:destroy`)
        }
    }

    decorate(Injectable(), Service)
    return { provider: Service as unknown as Provider, lives }
}

/** Mounted and untouched. */
const LIVE: HookCounts = { init: 1, mount: 1, unmount: 0, destroy: 0 }
/** Went through the full arc exactly once. */
const BURIED: HookCounts = { init: 1, mount: 1, unmount: 1, destroy: 1 }
/** Unmounted but never destroyed — what an App looks like after AppProvider lets go of it. */
const RELEASED: HookCounts = { init: 1, mount: 1, unmount: 1, destroy: 0 }
/** Built and inited, then held back because its parent was not mounted. */
const GATED: HookCounts = { init: 1, mount: 0, unmount: 0, destroy: 0 }

const counts = (subject: Generational): HookCounts[] => subject.lives.map((life) => life.counts)

// Probes
// ========================================

/** Records every distinct module the context has handed this position in the tree. */
function ModuleProbe({ into }: { into: Module[] }): ReactNode {
    const { module } = useModuleContext()
    if (into.at(-1) !== module) into.push(module)
    return null
}

function Rebuilder({ capture }: { capture: (rebuild: () => void) => void }): ReactNode {
    capture(useModuleRebuild())
    return null
}

function SafeProbe({ token, into }: { token: symbol; into: Array<string | undefined> }): ReactNode {
    const value = useResolveSafe<string>(token)
    if (into.length === 0 || into.at(-1) !== value) into.push(value)
    return null
}

const MARK = Symbol.for("tests.app-swap.mark")
const ONLY_IN_A = Symbol.for("tests.app-swap.only-in-a")

// Forward swap
// ========================================

describe("swapping <AppProvider app> for a fresh App", () => {
    it("releases the old app, mounts the new one, and rebuilds the scoped children under it", async () => {
        const log: string[] = []
        const first = generational(log, "A")
        const second = generational(log, "B")
        const child = generational(log, "C")
        const modules: Module[] = []

        const a = new App({ id: "a", providers: [first.provider] })
        const b = new App({ id: "b", providers: [second.provider] })

        function Tree({ app }: { app: App }): ReactNode {
            return (
                <AppProvider app={app}>
                    <ModuleProvider id="child" providers={[child.provider]}>
                        <ModuleProbe into={modules} />
                        <span data-testid="content">content</span>
                    </ModuleProvider>
                </AppProvider>
            )
        }

        const { rerender } = render(<Tree app={a} />)
        expect(counts(first)).toEqual([LIVE])
        expect(counts(child)).toEqual([LIVE])
        const oldChild = modules[0]!
        log.length = 0

        rerender(<Tree app={b} />)
        await flush()

        // MEASURED, EXACT — four things happen, in this order:
        //
        // 1. Render phase: AppProvider inits `b` (it is not initialized yet) before any child renders.
        // 2. Commit, cleanup half: `a.unmount()` cascades children-first, so the OLD child's unmount hooks
        //    run before the app's own.
        // 3. Commit, setup half: `b.mount()`.
        // 4. The child's parent-change effect sees a different module in context and rebuilds: a new
        //    generation forked from `b`, the old one destroyed, the new one mounted last.
        expect(log).toEqual([
            "B#1:ctor",
            "B#1:init",
            "C#1:unmount",
            "A#1:unmount",
            "B#1:mount",
            "C#2:ctor",
            "C#2:init",
            "C#1:destroy",
            "C#2:mount",
        ])

        // `a` is RELEASED, not destroyed: AppProvider let go of it and the owner still owns it. It stays
        // initialized and unclaimed, so `a.destroy()` remains the owner's call to make.
        expect(counts(first)).toEqual([RELEASED])
        expect(a.initialized).toBe(true)
        expect(a.mounted).toBe(false)
        expect(a.claimed).toBe(false)

        // `b` is fully live and owns the tree now.
        expect(counts(second)).toEqual([LIVE])
        expect(b.mounted).toBe(true)

        // The child was buried by the rebuild, not orphaned: claimed, detached from `a`, and its
        // replacement is attached to `b`.
        expect(counts(child)).toEqual([BURIED, LIVE])
        expect(oldChild.claimed).toBe(true)
        expect(a.children.size).toBe(0)
        expect([...b.children]).toEqual([modules.at(-1)])
        expect(modules.length).toBe(2)
        expect(modules.at(-1)?.parent).toBe(b)
    })
})

// Swapping back
// ========================================

describe("swapping back to an App that has already been mounted once", () => {
    it("leaves a DEAD tree: the app refuses to re-mount and its children stay gated", async () => {
        const log: string[] = []
        const appTracker = generational(log, "A")
        const child = generational(log, "C")
        const modules: Module[] = []

        const a = new App({ id: "a", providers: [appTracker.provider] })
        const b = new App({ id: "b" })

        function Tree({ app }: { app: App }): ReactNode {
            return (
                <AppProvider app={app}>
                    <ModuleProvider id="child" providers={[child.provider]}>
                        <ModuleProbe into={modules} />
                        <span data-testid="content">content</span>
                    </ModuleProvider>
                </AppProvider>
            )
        }

        const { rerender } = render(<Tree app={a} />)
        rerender(<Tree app={b} />)
        await flush()
        log.length = 0

        rerender(<Tree app={a} />)
        await flush()

        // ==================== MEASURED — the dead tree, documented not blessed ====================
        //
        // `mount()` bails on `if (this.#committed) return`, and `#committed` is only cleared inside
        // `#claimSubtree` — i.e. by a destroy. AppProvider never destroys, so an App it has unmounted is
        // permanently un-mountable. Note what is NOT in this log: there is no second `A#1:mount`.
        expect(log).toEqual(["C#2:unmount", "C#3:ctor", "C#3:init", "C#2:destroy"])
        expect(counts(appTracker)).toEqual([RELEASED])
        expect(a.initialized).toBe(true)
        expect(a.claimed).toBe(false)
        expect(a.mounted).toBe(false)

        // The child follows its parent down. Its new generation is built, inited and even ATTACHED — the
        // registry has it — but `mount()` gates on `parent.mounted`, which is false and can never become
        // true, so the mount hooks never fire. A live React tree over a module that will never mount.
        expect(counts(child)).toEqual([BURIED, BURIED, GATED])
        expect(a.children.size).toBe(1)
        expect(modules.length).toBe(3)
        expect(modules.at(-1)?.parent).toBe(a)
        expect(modules.at(-1)?.mounted).toBe(false)
    })

    it("cannot be rescued by rebuild() — only a fresh App instance brings the tree back", async () => {
        const log: string[] = []
        const child = generational(log, "C")
        const modules: Module[] = []
        let rebuild: () => void = () => {}

        const a = new App({ id: "a" })
        const b = new App({ id: "b" })
        const c = new App({ id: "c" })

        function Tree({ app }: { app: App }): ReactNode {
            return (
                <AppProvider app={app}>
                    <ModuleProvider id="child" providers={[child.provider]}>
                        <Rebuilder capture={(fn) => (rebuild = fn)} />
                        <ModuleProbe into={modules} />
                    </ModuleProvider>
                </AppProvider>
            )
        }

        const { rerender } = render(<Tree app={a} />)
        rerender(<Tree app={b} />)
        await flush()
        rerender(<Tree app={a} />)
        await flush()
        log.length = 0

        // A rebuild only replaces the CHILD. The new generation forks the same un-mountable parent and is
        // gated exactly like the one it replaced — rebuilding is not an escape hatch here.
        await act(async () => rebuild())
        await flush()

        expect(log).toEqual(["C#4:ctor", "C#4:init", "C#3:destroy"])
        expect(counts(child).at(-1)).toEqual(GATED)
        expect(modules.at(-1)?.mounted).toBe(false)
        expect(a.mounted).toBe(false)
        log.length = 0

        // A NEW App has never been committed, so it mounts normally and the parent-change rebuild brings
        // the whole subtree back to life. That is the only escape: a fresh instance, not a reused one.
        rerender(<Tree app={c} />)
        await flush()

        expect(c.mounted).toBe(true)
        expect(counts(child).at(-1)).toEqual(LIVE)
        expect(modules.at(-1)?.parent).toBe(c)
        expect(modules.at(-1)?.mounted).toBe(true)
    })
})

// Nested apps
// ========================================

describe("an <AppProvider> nested inside another app's tree", () => {
    it("keeps the two trees parentless and independent", async () => {
        const log: string[] = []
        const outer = generational(log, "Outer")
        const inner = generational(log, "Inner")
        const outerSeen: Array<string | undefined> = []
        const innerSeen: Array<string | undefined> = []
        const innerOnlyInA: Array<string | undefined> = []
        let hide: () => void = () => {}

        const a = new App({
            id: "a",
            providers: [outer.provider, { provide: MARK, useValue: "from-a" }, { provide: ONLY_IN_A, useValue: "a" }],
        })
        const b = new App({ id: "b", providers: [inner.provider, { provide: MARK, useValue: "from-b" }] })

        function Harness(): ReactNode {
            const [nested, setNested] = useState(true)
            hide = () => setNested(false)
            return (
                <AppProvider app={a}>
                    <ModuleProvider id="outer">
                        <SafeProbe token={MARK} into={outerSeen} />
                        {nested ? (
                            <AppProvider app={b}>
                                <ModuleProvider id="inner">
                                    <SafeProbe token={MARK} into={innerSeen} />
                                    <SafeProbe token={ONLY_IN_A} into={innerOnlyInA} />
                                </ModuleProvider>
                            </AppProvider>
                        ) : null}
                    </ModuleProvider>
                </AppProvider>
            )
        }

        render(<Harness />)

        // Two roots, not a parent and a child: `new App(...)` pins `parent = null`, so nesting in JSX buys
        // no container relationship at all. The inner tree resolves from b and cannot see a's bindings.
        expect(b.parent).toBeNull()
        expect([...a.children]).not.toContain(b)
        expect(a.children.size).toBe(1)
        expect(outerSeen).toEqual(["from-a"])
        expect(innerSeen).toEqual(["from-b"])
        expect(innerOnlyInA).toEqual([undefined])
        expect(counts(outer)).toEqual([LIVE])
        expect(counts(inner)).toEqual([LIVE])

        // Teardown is independent too: dropping the inner AppProvider unmounts b and leaves a alone — and
        // b is only unmounted, never destroyed, because AppProvider never destroys anything.
        log.length = 0
        await act(async () => hide())
        await flush()

        expect(log).toEqual(["Inner#1:unmount"])
        expect(counts(inner)).toEqual([RELEASED])
        expect(counts(outer)).toEqual([LIVE])
        expect(a.mounted).toBe(true)
        expect(b.mounted).toBe(false)
        expect(b.claimed).toBe(false)
    })
})
