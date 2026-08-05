import { act, render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useState, type ReactNode } from "react"

import { Module } from "../../src/core/module/module.js"
import { Resolver } from "../../src/core/providers/resolver/resolver.provider.js"
import { useModuleContext, useModuleRebuild } from "../../src/react/hooks/useModuleContext.js"
import { useResolve } from "../../src/react/hooks/useResolve.js"
import { ModuleProvider } from "../../src/react/providers/ModuleProvider.js"
import type { Provider } from "../../src/types.js"
import { Root } from "../setup/react.js"
import { flush, type HookCounts } from "../setup/helpers.js"

// Rebuild generation semantics
// ========================================
//
// `rebuild.test.tsx` pins *when* a rebuild fires and the order of the hook log. This file pins what a
// rebuild IS: a generation swap. Every module, container and instance from the outgoing generation is a
// corpse — detached, unmounted, destroyed, and never rewired to the replacement. The only way back into the
// live generation is the React context, which is why held references are invalid by design.
//
// The shared `tracked()` helper counts per CLASS, so it cannot tell generation 1 from generation 2. Here the
// counters live per INSTANCE, which is the whole point: "the new child inits cleanly at 1" is a statement
// about one instance, not about a running total.

// Per-generation tracking
// ========================================

type Life = { gen: number; counts: HookCounts }

type Generational = {
    /** Register as a bare class provider, or as the `useClass` of a token. */
    provider: Provider
    /** One entry per constructed instance, in construction order. */
    lives: Life[]
    /** The instances themselves, for identity assertions. */
    instances: object[]
}

function generational(log: string[], label: string): Generational {
    const lives: Life[] = []
    const instances: object[] = []

    const Service = class {
        readonly life: Life

        constructor() {
            this.life = { gen: lives.length + 1, counts: { init: 0, mount: 0, unmount: 0, destroy: 0 } }
            lives.push(this.life)
            instances.push(this)
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

    return { provider: Service as unknown as Provider, lives, instances }
}

/** Mounted and untouched. */
const LIVE: HookCounts = { init: 1, mount: 1, unmount: 0, destroy: 0 }
/** Went through the full arc exactly once. */
const BURIED: HookCounts = { init: 1, mount: 1, unmount: 1, destroy: 1 }

// Probes
// ========================================

function Rebuilder({ capture }: { capture: (rebuild: () => void) => void }): ReactNode {
    capture(useModuleRebuild())
    return null
}

/** Records every distinct module the context has handed this position in the tree. */
function ModuleProbe({ into }: { into: Module[] }): ReactNode {
    const { module } = useModuleContext()
    if (into.at(-1) !== module) into.push(module)
    return null
}

/** Records every distinct instance re-resolution has produced at this position. */
function ResolveProbe({ token, into }: { token: symbol; into: object[] }): ReactNode {
    const instance = useResolve<object>(token)
    if (into.at(-1) !== instance) into.push(instance)
    return null
}

const SERVICE = Symbol.for("tests.rebuild-torture.service")
const LAZY = Symbol.for("tests.rebuild-torture.lazy")

// A new module, a new container
// ========================================

describe("rebuild generation identity", () => {
    it("mints a module and a container that share nothing with the outgoing generation", async () => {
        const modules: Module[] = []
        let rebuild: (() => void) | null = null

        render(
            <Root>
                <ModuleProvider id="feature">
                    <Rebuilder capture={(fn) => (rebuild = fn)} />
                    <ModuleProbe into={modules} />
                </ModuleProvider>
            </Root>
        )

        expect(modules).toHaveLength(1)
        const [old] = modules

        await act(async () => {
            rebuild?.()
        })
        await flush()

        expect(modules).toHaveLength(2)
        const fresh = modules[1]!

        // Both halves of the identity change: the Module instance AND the container it wraps.
        expect(fresh).not.toBe(old)
        expect(fresh.container).not.toBe(old!.container)
        expect(fresh).toBeInstanceOf(Module)

        // Same position in the tree — a rebuild re-forks the same parent, it does not reparent.
        expect(fresh.parent).toBe(old!.parent)
        expect(fresh.id).toBe("feature")

        // The outgoing module keeps `initialized` (it was, historically) but is no longer mounted, and the
        // incoming one is live.
        expect(old!.mounted).toBe(false)
        expect(old!.initialized).toBe(true)
        expect(fresh.mounted).toBe(true)
    })

    it("detaches the old module from its parent and attaches the new one in its place", async () => {
        const modules: Module[] = []
        let rebuild: (() => void) | null = null

        render(
            <Root>
                <ModuleProvider>
                    <Rebuilder capture={(fn) => (rebuild = fn)} />
                    <ModuleProbe into={modules} />
                </ModuleProvider>
            </Root>
        )

        const parent = modules[0]!.parent!

        await act(async () => {
            rebuild?.()
        })
        await flush()

        // The app holds exactly one child at every point — the live generation, never both.
        expect([...parent.children]).toEqual([modules[1]])
    })
})

// The old subtree dies whole
// ========================================

describe("rebuild teardown of the subtree", () => {
    it("buries the nested child of the outgoing generation and inits the new one from scratch", async () => {
        const log: string[] = []
        const parentSvc = generational(log, "P")
        const childSvc = generational(log, "C")
        const parents: Module[] = []
        const children: Module[] = []
        let rebuild: (() => void) | null = null

        render(
            <Root>
                <ModuleProvider providers={[parentSvc.provider]}>
                    <Rebuilder capture={(fn) => (rebuild = fn)} />
                    <ModuleProbe into={parents} />
                    <ModuleProvider providers={[childSvc.provider]}>
                        <ModuleProbe into={children} />
                    </ModuleProvider>
                </ModuleProvider>
            </Root>
        )

        expect(parentSvc.lives).toEqual([{ gen: 1, counts: LIVE }])
        expect(childSvc.lives).toEqual([{ gen: 1, counts: LIVE }])

        await act(async () => {
            rebuild?.()
        })
        await flush()

        // Generation 1 of BOTH levels is fully torn down — the child never survives its parent — and
        // generation 2 of both starts from a clean slate rather than inheriting a running total.
        expect(parentSvc.lives).toEqual([
            { gen: 1, counts: BURIED },
            { gen: 2, counts: LIVE },
        ])
        expect(childSvc.lives).toEqual([
            { gen: 1, counts: BURIED },
            { gen: 2, counts: LIVE },
        ])

        // The child boundary is rebuilt too, so its module identity moves with the parent's...
        expect(children).toHaveLength(2)
        expect(children[1]).not.toBe(children[0])

        // ...and the dead parent is left holding nothing: the whole claimed subtree detached on destroy.
        expect(parents[0]!.children.size).toBe(0)
        expect([...parents[1]!.children]).toEqual([children[1]])
    })

    it("leaves no old-generation instance reachable from the new generation", async () => {
        const log: string[] = []
        const service = generational(log, "S")
        const modules: Module[] = []
        const resolved: object[] = []
        let rebuild: (() => void) | null = null

        render(
            <Root>
                <ModuleProvider providers={[{ provide: SERVICE, useClass: service.provider } as Provider]}>
                    <Rebuilder capture={(fn) => (rebuild = fn)} />
                    <ModuleProbe into={modules} />
                    <ResolveProbe token={SERVICE} into={resolved} />
                </ModuleProvider>
            </Root>
        )

        // Everything a consumer could have squirreled away during generation 1.
        const oldModule = modules[0]!
        const oldContainer = oldModule.container
        const oldResolver = oldContainer.resolve(Resolver)
        const oldInstance = oldContainer.resolve<object>(SERVICE)
        expect(service.instances[0]).toBe(oldInstance)

        await act(async () => {
            rebuild?.()
        })
        await flush()

        const newModule = modules[1]!
        const newInstance = newModule.container.resolve<object>(SERVICE)

        // A component re-resolves through context and gets the live instance.
        expect(newInstance).not.toBe(oldInstance)
        expect(resolved).toEqual([oldInstance, newInstance])

        // A HELD reference does not. The old Resolver was constructed against the old container and is
        // never rewired — it keeps handing out generation 1, which by now is unmounted and destroyed.
        // This is the reference-invalidation semantic: old references are corpses, not stale proxies.
        expect(oldResolver.resolve<object>(SERVICE)).toBe(oldInstance)
        expect(oldResolver.resolve(Module)).toBe(oldModule)
        expect(oldResolver.resolve(Module)).not.toBe(newModule)
        expect(oldContainer.resolve(Resolver)).toBe(oldResolver)
        expect(newModule.container.resolve(Resolver)).not.toBe(oldResolver)

        expect(service.lives).toEqual([
            { gen: 1, counts: BURIED },
            { gen: 2, counts: LIVE },
        ])
    })
})

// Nested boundaries
// ========================================

describe("rebuild across nested boundaries", () => {
    it("keeps the parent and the siblings untouched when only the child rebuilds", async () => {
        const log: string[] = []
        const parentSvc = generational(log, "P")
        const childSvc = generational(log, "C")
        const siblingSvc = generational(log, "X")
        const parents: Module[] = []
        const siblings: Module[] = []
        let rebuildChild: (() => void) | null = null

        render(
            <Root>
                <ModuleProvider providers={[parentSvc.provider]}>
                    <ModuleProbe into={parents} />
                    <ModuleProvider providers={[childSvc.provider]}>
                        <Rebuilder capture={(fn) => (rebuildChild = fn)} />
                    </ModuleProvider>
                    <ModuleProvider providers={[siblingSvc.provider]}>
                        <ModuleProbe into={siblings} />
                    </ModuleProvider>
                </ModuleProvider>
            </Root>
        )

        const parentModule = parents[0]!
        const siblingModule = siblings[0]!
        log.length = 0

        await act(async () => {
            rebuildChild?.()
        })
        await flush()

        // A rebuild travels down, never up or sideways: only the child's own generation advances.
        expect(log).toEqual(["C#2:ctor", "C#2:init", "C#1:unmount", "C#1:destroy", "C#2:mount"])
        expect(parentSvc.lives).toEqual([{ gen: 1, counts: LIVE }])
        expect(siblingSvc.lives).toEqual([{ gen: 1, counts: LIVE }])
        expect(childSvc.lives).toEqual([
            { gen: 1, counts: BURIED },
            { gen: 2, counts: LIVE },
        ])

        // Module identity is the sharper form of "untouched" — the counts could match by luck, the
        // instances cannot.
        expect(parents).toEqual([parentModule])
        expect(siblings).toEqual([siblingModule])
        expect(parentModule.mounted).toBe(true)
    })

    it("cascades into the child when the parent rebuilds, and each level advances exactly one generation", async () => {
        const log: string[] = []
        const parentSvc = generational(log, "P")
        const childSvc = generational(log, "C")
        let rebuildParent: (() => void) | null = null
        let rebuildChild: (() => void) | null = null

        render(
            <Root>
                <ModuleProvider providers={[parentSvc.provider]}>
                    <Rebuilder capture={(fn) => (rebuildParent = fn)} />
                    <ModuleProvider providers={[childSvc.provider]}>
                        <Rebuilder capture={(fn) => (rebuildChild = fn)} />
                    </ModuleProvider>
                </ModuleProvider>
            </Root>
        )

        // Advance the child on its own first, so the two levels sit on different generation numbers and a
        // cascade cannot be mistaken for a coincidence.
        await act(async () => {
            rebuildChild?.()
        })
        await flush()
        log.length = 0

        await act(async () => {
            rebuildParent?.()
        })
        await flush()

        // Two different orderings, and the difference is the point:
        //
        //   - the boundary that INITIATED the rebuild builds its replacement first (P#2 ctor/init) and only
        //     then tears the outgoing one down — the "new before old" contract;
        //   - a CASCADED child cannot: its replacement has to fork the new parent, which does not exist
        //     until the parent's teardown has completed. So C#3 is constructed after C#2 is destroyed.
        expect(log).toEqual([
            "P#2:ctor",
            "P#2:init",
            "C#2:unmount",
            "P#1:unmount",
            "C#2:destroy",
            "P#2:mount",
            "C#3:ctor",
            "C#3:init",
            "C#3:mount",
            "P#1:destroy",
        ])

        expect(parentSvc.lives).toEqual([
            { gen: 1, counts: BURIED },
            { gen: 2, counts: LIVE },
        ])
        expect(childSvc.lives).toEqual([
            { gen: 1, counts: BURIED },
            { gen: 2, counts: BURIED },
            { gen: 3, counts: LIVE },
        ])
    })
})

// Rapid-fire rebuilds
// ========================================

describe("consecutive rebuilds", () => {
    it("leaves exactly one live generation when two triggers land in the same act", async () => {
        const log: string[] = []
        const service = generational(log, "S")
        let rebuild: (() => void) | null = null
        let bump: (() => void) | null = null

        function Harness(): ReactNode {
            const [dep, setDep] = useState(0)
            bump = () => setDep((value) => value + 1)
            return (
                <Root>
                    <ModuleProvider providers={[service.provider]} rebuildOn={[dep]}>
                        <Rebuilder capture={(fn) => (rebuild = fn)} />
                    </ModuleProvider>
                </Root>
            )
        }

        render(<Harness />)

        // Two independent sources — a manual rebuild and a rebuildOn diff — in one flush.
        await act(async () => {
            rebuild?.()
            bump?.()
        })
        await flush()

        // Pinning the actual: the two triggers do NOT coalesce. The manual rebuild schedules under
        // "module.rebuild" and flushes on the forced re-render; the rebuildOn diff is only observed on the
        // render after that, so it schedules a second time. Three generations get built.
        //
        // Wasteful, not leaky — and that is the invariant worth having: the middle generation is mounted
        // and buried within the same act, never left constructed-but-undestroyed.
        expectOneLiveGeneration(service)
        expect(service.lives).toEqual([
            { gen: 1, counts: BURIED },
            { gen: 2, counts: BURIED },
            { gen: 3, counts: LIVE },
        ])
    })

    it("leaves exactly one live generation when rebuilds land in back-to-back ticks", async () => {
        const log: string[] = []
        const service = generational(log, "S")
        let rebuild: (() => void) | null = null

        render(
            <Root>
                <ModuleProvider providers={[service.provider]}>
                    <Rebuilder capture={(fn) => (rebuild = fn)} />
                </ModuleProvider>
            </Root>
        )

        // Separate synchronous acts with no await between them: each one gets its own layout-effect flush,
        // so these do NOT coalesce — three generations are constructed in total.
        act(() => {
            rebuild?.()
        })
        act(() => {
            rebuild?.()
        })
        await flush()

        expect(service.lives).toHaveLength(3)
        expectOneLiveGeneration(service)
    })

    it("survives a burst of rebuilds interleaved with rebuildOn churn", async () => {
        const log: string[] = []
        const service = generational(log, "S")
        const modules: Module[] = []
        let rebuild: (() => void) | null = null
        let bump: (() => void) | null = null

        function Harness(): ReactNode {
            const [dep, setDep] = useState(0)
            bump = () => setDep((value) => value + 1)
            return (
                <Root>
                    <ModuleProvider providers={[service.provider]} rebuildOn={[dep]}>
                        <Rebuilder capture={(fn) => (rebuild = fn)} />
                        <ModuleProbe into={modules} />
                    </ModuleProvider>
                </Root>
            )
        }

        render(<Harness />)

        act(() => {
            rebuild?.()
            rebuild?.()
        })
        act(() => {
            bump?.()
        })
        act(() => {
            rebuild?.()
            bump?.()
        })
        await flush()

        expectOneLiveGeneration(service)

        // The context always points at the live generation, and every module it ever handed out is
        // distinct — no generation is re-entered.
        expect(new Set(modules).size).toBe(modules.length)
        expect(modules.at(-1)!.mounted).toBe(true)
        for (const dead of modules.slice(0, -1)) expect(dead.mounted).toBe(false)
    })
})

/** Exactly one instance still mounted; every earlier one unmounted and destroyed exactly once. */
function expectOneLiveGeneration(service: Generational): void {
    expect(service.lives.at(-1)).toEqual({ gen: service.lives.length, counts: LIVE })
    expect(service.lives.slice(0, -1)).toEqual(
        service.lives.slice(0, -1).map((life) => ({ gen: life.gen, counts: BURIED }))
    )
}

// Lazy providers across a rebuild
// ========================================

describe("rebuild with a lazily resolved provider", () => {
    it("buries a lazy instance with the generation that built it", async () => {
        const log: string[] = []
        const lazy = generational(log, "L")
        const modules: Module[] = []
        let rebuild: (() => void) | null = null

        render(
            <Root>
                <ModuleProvider providers={[{ provide: LAZY, useClass: lazy.provider, lazy: true } as Provider]}>
                    <Rebuilder capture={(fn) => (rebuild = fn)} />
                    <ModuleProbe into={modules} />
                </ModuleProvider>
            </Root>
        )

        // Nothing built by mount — that is what `lazy` buys.
        expect(lazy.lives).toEqual([])

        // Resolved mid-generation, after the module has already mounted: it catches up with init alone,
        // because mount is a tree event that has gone past.
        const first = modules[0]!.container.resolve<object>(LAZY)
        expect(lazy.lives).toEqual([{ gen: 1, counts: { init: 1, mount: 0, unmount: 0, destroy: 0 } }])

        await act(async () => {
            rebuild?.()
        })
        await flush()

        // A late arrival is still a member of its module, so it unmounts and destroys with it...
        expect(lazy.lives).toEqual([{ gen: 1, counts: { init: 1, mount: 0, unmount: 1, destroy: 1 } }])

        // ...and the new generation starts unresolved: a rebuild does not replay resolutions.
        const fresh = modules[1]!.container.resolve<object>(LAZY)
        expect(fresh).not.toBe(first)
        expect(lazy.lives).toEqual([
            { gen: 1, counts: { init: 1, mount: 0, unmount: 1, destroy: 1 } },
            { gen: 2, counts: { init: 1, mount: 0, unmount: 0, destroy: 0 } },
        ])
    })
})
