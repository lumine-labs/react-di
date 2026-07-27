import { act, render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useState, type ReactNode } from "react"

import { Container } from "../../src/container/index.js"
import { ModuleRegistry } from "../../src/core/providers/module-registry/module-registry.provider.js"
import { ModuleProvider } from "../../src/react/providers/ModuleProvider.js"
import { useModuleContext, useModuleRebuild } from "../../src/react/hooks/useModuleContext.js"
import { useResolveSafe } from "../../src/react/hooks/useResolve.js"
import { flush, tracked } from "../setup/helpers.js"

// Rebuild
// ========================================
//
// A rebuild resolves a fresh module *first* and tears the outgoing one down afterwards, from the effect
// that the swapped resolution invalidates. So the phase order across a rebuild is
// new:init → old:unmount → old:destroy → new:mount, and both containers are briefly alive at once.

const DYNAMIC = Symbol.for("tests.rebuild.dynamic")

function Rebuilder({ capture }: { capture: (rebuild: () => void) => void }): ReactNode {
    capture(useModuleRebuild())
    return null
}

describe("rebuildOn", () => {
    it("never fires on the first render", () => {
        const log: string[] = []
        const Service = tracked(log, "S")

        render(
            <ModuleProvider root providers={[Service]} rebuildOn={["initial"]}>
                <div />
            </ModuleProvider>
        )

        expect(log).toEqual(["S:ctor", "S:init", "S:mount"])
        expect(Service.counts).toEqual({ init: 1, mount: 1, unmount: 0, destroy: 0 })
    })

    it("does not fire when the values are unchanged", () => {
        const log: string[] = []
        const Service = tracked(log, "S")

        function Harness(): ReactNode {
            const [tick, setTick] = useState(0)
            bump = () => setTick((value) => value + 1)
            return (
                <ModuleProvider root providers={[Service]} rebuildOn={["stable"]}>
                    <span data-testid="tick">{tick}</span>
                </ModuleProvider>
            )
        }
        let bump: (() => void) | null = null

        const { getByTestId } = render(<Harness />)
        log.length = 0

        act(() => bump?.())
        act(() => bump?.())

        expect(getByTestId("tick").textContent).toBe("2")
        expect(log).toEqual([])
        expect(Service.counts).toEqual({ init: 1, mount: 1, unmount: 0, destroy: 0 })
    })

    it("fires once when a value changes", async () => {
        const log: string[] = []
        const Service = tracked(log, "S")

        function Tree({ dep }: { dep: number }): ReactNode {
            return (
                <ModuleProvider root providers={[Service]} rebuildOn={[dep]}>
                    <div />
                </ModuleProvider>
            )
        }

        const { rerender } = render(<Tree dep={0} />)
        log.length = 0

        rerender(<Tree dep={1} />)
        await flush()

        expect(log).toEqual(["S:ctor", "S:init", "S:unmount", "S:destroy", "S:mount"])
        expect(Service.counts).toEqual({ init: 2, mount: 2, unmount: 1, destroy: 1 })
    })

    it("fires when the array length changes", async () => {
        const log: string[] = []
        const Service = tracked(log, "S")

        function Tree({ dep }: { dep: number[] }): ReactNode {
            return (
                <ModuleProvider root providers={[Service]} rebuildOn={dep}>
                    <div />
                </ModuleProvider>
            )
        }

        const { rerender } = render(<Tree dep={[1]} />)
        log.length = 0

        rerender(<Tree dep={[1, 2]} />)
        await flush()

        expect(Service.counts).toEqual({ init: 2, mount: 2, unmount: 1, destroy: 1 })
    })

    it("compares with Object.is, so NaN counts as unchanged", async () => {
        const log: string[] = []
        const Service = tracked(log, "S")

        function Tree({ dep }: { dep: number }): ReactNode {
            return (
                <ModuleProvider root providers={[Service]} rebuildOn={[dep]}>
                    <div />
                </ModuleProvider>
            )
        }

        const { rerender } = render(<Tree dep={NaN} />)
        log.length = 0

        rerender(<Tree dep={NaN} />)
        await flush()

        expect(log).toEqual([])
        expect(Service.counts).toEqual({ init: 1, mount: 1, unmount: 0, destroy: 0 })
    })

    it("ignores a transition to or from undefined", async () => {
        const log: string[] = []
        const Service = tracked(log, "S")

        function Tree({ dep }: { dep: number[] | undefined }): ReactNode {
            return (
                <ModuleProvider root providers={[Service]} rebuildOn={dep}>
                    <div />
                </ModuleProvider>
            )
        }

        const { rerender } = render(<Tree dep={[1]} />)
        log.length = 0

        // Dropping the prop is "stop watching", not "everything changed"...
        rerender(<Tree dep={undefined} />)
        await flush()
        expect(log).toEqual([])

        // ...and picking it up again has no previous list to compare against.
        rerender(<Tree dep={[9]} />)
        await flush()
        expect(log).toEqual([])
        expect(Service.counts).toEqual({ init: 1, mount: 1, unmount: 0, destroy: 0 })
    })
})

describe("manual rebuild", () => {
    it("tears the old module down and builds a new one, in that order", async () => {
        const log: string[] = []
        const Service = tracked(log, "S")
        let rebuild: (() => void) | null = null
        let inits = 0

        render(
            <ModuleProvider
                root
                providers={[Service]}
                onModuleInit={() => log.push(`module:init#${++inits}`)}
                onModuleMount={() => log.push("module:mount")}
                onModuleUnmount={() => log.push("module:unmount")}
                onModuleDestroy={() => log.push("module:destroy")}
            >
                <Rebuilder capture={(fn) => (rebuild = fn)} />
            </ModuleProvider>
        )

        expect(log).toEqual(["S:ctor", "module:init#1", "S:init", "module:mount", "S:mount"])
        log.length = 0

        await act(async () => {
            rebuild?.()
        })

        // The replacement is built and inited before the outgoing module hears about it, and only mounts
        // once the old one has gone.
        expect(log).toEqual([
            "S:ctor",
            "module:init#2",
            "S:init",
            "S:unmount",
            "module:unmount",
            "S:destroy",
            "module:mount",
            "S:mount",
            "module:destroy",
        ])
        expect(Service.counts).toEqual({ init: 2, mount: 2, unmount: 1, destroy: 1 })
    })

    it("swaps the container the context hands out", async () => {
        const containers: Container[] = []
        let rebuild: (() => void) | null = null

        function Probe(): ReactNode {
            containers.push(useModuleContext().container)
            return null
        }

        render(
            <ModuleProvider root>
                <Rebuilder capture={(fn) => (rebuild = fn)} />
                <Probe />
            </ModuleProvider>
        )

        await act(async () => {
            rebuild?.()
        })

        expect(new Set(containers).size).toBe(2)
        expect(containers.at(-1)).toBeInstanceOf(Container)
        expect(containers.at(-1)).not.toBe(containers[0])
    })

    it("coalesces several rebuilds in one tick into one", async () => {
        const log: string[] = []
        const Service = tracked(log, "S")
        let rebuild: (() => void) | null = null

        render(
            <ModuleProvider root providers={[Service]}>
                <Rebuilder capture={(fn) => (rebuild = fn)} />
            </ModuleProvider>
        )
        log.length = 0

        await act(async () => {
            rebuild?.()
            rebuild?.()
            rebuild?.()
        })

        expect(log).toEqual(["S:ctor", "S:init", "S:unmount", "S:destroy", "S:mount"])
        expect(Service.counts).toEqual({ init: 2, mount: 2, unmount: 1, destroy: 1 })
    })

    it("rebuilds again on a later tick", async () => {
        const log: string[] = []
        const Service = tracked(log, "S")
        let rebuild: (() => void) | null = null

        render(
            <ModuleProvider root providers={[Service]}>
                <Rebuilder capture={(fn) => (rebuild = fn)} />
            </ModuleProvider>
        )

        await act(async () => {
            rebuild?.()
        })
        await act(async () => {
            rebuild?.()
        })

        expect(Service.counts).toEqual({ init: 3, mount: 3, unmount: 2, destroy: 2 })
    })

    it("keeps a params id and regenerates a generated one", async () => {
        const withParamsId: string[] = []
        const generated: string[] = []
        let rebuildA: (() => void) | null = null
        let rebuildB: (() => void) | null = null

        function ProbeA(): ReactNode {
            withParamsId.push(useModuleContext().id)
            return null
        }
        function ProbeB(): ReactNode {
            generated.push(useModuleContext().id)
            return null
        }

        render(
            <>
                <ModuleProvider root id="feature:stable">
                    <Rebuilder capture={(fn) => (rebuildA = fn)} />
                    <ProbeA />
                </ModuleProvider>
                <ModuleProvider root>
                    <Rebuilder capture={(fn) => (rebuildB = fn)} />
                    <ProbeB />
                </ModuleProvider>
            </>
        )

        await act(async () => {
            rebuildA?.()
            rebuildB?.()
        })

        // A user id is the addressable identity, so it must survive; a generated one is a per-resolution
        // debug label nothing can address, so it is free to change.
        expect(new Set(withParamsId)).toEqual(new Set(["feature:stable"]))
        expect(generated.length).toBeGreaterThanOrEqual(2)
        expect(new Set(generated).size).toBe(generated.length)
        for (const id of generated) expect(id).toMatch(/^id:\d+$/)
    })

    it("rebuilds a factory module through a fresh factory call", async () => {
        const seen: string[] = []
        let calls = 0
        let rebuild: (() => void) | null = null

        function Probe(): ReactNode {
            seen.push(useResolveSafe<string>(DYNAMIC)!)
            return null
        }

        render(
            <ModuleProvider
                factory={() => {
                    calls += 1
                    const container = new Container()
                    container.register({ provide: DYNAMIC, useValue: `factory-${calls}` })
                    return container
                }}
            >
                <Rebuilder capture={(fn) => (rebuild = fn)} />
                <Probe />
            </ModuleProvider>
        )

        expect(seen).toEqual(["factory-1"])

        await act(async () => {
            rebuild?.()
        })

        expect(calls).toBe(2)
        expect(seen.at(-1)).toBe("factory-2")
    })
})

describe("rebuild across a module tree", () => {
    it("rebuilds a scoped child when the parent container changes", async () => {
        const log: string[] = []
        const Parent = tracked(log, "P")
        const Child = tracked(log, "C")
        let rebuild: (() => void) | null = null

        render(
            <ModuleProvider root providers={[Parent]}>
                <Rebuilder capture={(fn) => (rebuild = fn)} />
                <ModuleProvider providers={[Child]}>
                    <div />
                </ModuleProvider>
            </ModuleProvider>
        )
        log.length = 0

        await act(async () => {
            rebuild?.()
        })
        await flush()

        expect(log).toEqual([
            "P:ctor",
            "P:init",
            "C:unmount",
            "P:unmount",
            "C:destroy",
            "P:mount",
            "C:ctor",
            "C:init",
            "C:mount",
            "P:destroy",
        ])
        expect(Parent.counts).toEqual({ init: 2, mount: 2, unmount: 1, destroy: 1 })
        expect(Child.counts).toEqual({ init: 2, mount: 2, unmount: 1, destroy: 1 })
    })

    it("gives the child a new container and reattaches it to the new parent", async () => {
        const childContainers: Container[] = []
        let rebuild: (() => void) | null = null
        let parentContainer: Container | null = null

        function ParentProbe(): ReactNode {
            parentContainer = useModuleContext().container
            return null
        }
        function ChildProbe(): ReactNode {
            childContainers.push(useModuleContext().container)
            return null
        }

        render(
            <ModuleProvider root id="parent">
                <Rebuilder capture={(fn) => (rebuild = fn)} />
                <ParentProbe />
                <ModuleProvider id="child">
                    <ChildProbe />
                </ModuleProvider>
            </ModuleProvider>
        )

        await act(async () => {
            rebuild?.()
        })
        await flush()

        expect(new Set(childContainers).size).toBe(2)
        expect(parentContainer!.resolve(ModuleRegistry).children()).toEqual([childContainers.at(-1)])
    })

    it("cascades down two scoped levels", async () => {
        const log: string[] = []
        const Root = tracked(log, "R")
        const Mid = tracked(log, "M")
        const Leaf = tracked(log, "L")
        let rebuild: (() => void) | null = null

        render(
            <ModuleProvider root providers={[Root]}>
                <Rebuilder capture={(fn) => (rebuild = fn)} />
                <ModuleProvider providers={[Mid]}>
                    <ModuleProvider providers={[Leaf]}>
                        <div />
                    </ModuleProvider>
                </ModuleProvider>
            </ModuleProvider>
        )
        log.length = 0

        await act(async () => {
            rebuild?.()
        })
        await flush()

        expect(Root.counts).toEqual({ init: 2, mount: 2, unmount: 1, destroy: 1 })
        expect(Mid.counts).toEqual({ init: 2, mount: 2, unmount: 1, destroy: 1 })
        expect(Leaf.counts).toEqual({ init: 2, mount: 2, unmount: 1, destroy: 1 })
    })

    it("reaches a descendant with a provider the parent only gained on rebuild", async () => {
        const seen: Array<string | undefined> = []
        let rebuild: (() => void) | null = null
        let enable: (() => void) | null = null

        function Probe(): ReactNode {
            seen.push(useResolveSafe<string>(DYNAMIC))
            return null
        }

        function Harness(): ReactNode {
            const [enabled, setEnabled] = useState(false)
            enable = () => setEnabled(true)
            return (
                <ModuleProvider root providers={enabled ? [{ provide: DYNAMIC, useValue: "enabled" }] : []}>
                    <Rebuilder capture={(fn) => (rebuild = fn)} />
                    <ModuleProvider>
                        <Probe />
                    </ModuleProvider>
                </ModuleProvider>
            )
        }

        render(<Harness />)
        expect(seen.at(-1)).toBeUndefined()

        // Providers are read once, at resolution: a changed `providers` prop alone changes nothing.
        act(() => enable?.())
        expect(seen.at(-1)).toBeUndefined()

        await act(async () => {
            rebuild?.()
        })
        await flush()

        expect(seen.at(-1)).toBe("enabled")
    })

    it("leaves a child's manual rebuild independent of the parent's", async () => {
        const log: string[] = []
        const Child = tracked(log, "C")
        let rebuildParent: (() => void) | null = null
        let rebuildChild: (() => void) | null = null

        render(
            <ModuleProvider root>
                <Rebuilder capture={(fn) => (rebuildParent = fn)} />
                <ModuleProvider providers={[Child]}>
                    <Rebuilder capture={(fn) => (rebuildChild = fn)} />
                </ModuleProvider>
            </ModuleProvider>
        )

        await act(async () => {
            rebuildParent?.()
        })
        await flush()
        expect(Child.counts).toEqual({ init: 2, mount: 2, unmount: 1, destroy: 1 })

        await act(async () => {
            rebuildChild?.()
        })
        await flush()
        expect(Child.counts).toEqual({ init: 3, mount: 3, unmount: 2, destroy: 2 })
    })

    it("leaves the parent alone when a child rebuilds", async () => {
        const log: string[] = []
        const Parent = tracked(log, "P")
        const Child = tracked(log, "C")
        let rebuildChild: (() => void) | null = null

        render(
            <ModuleProvider root providers={[Parent]}>
                <ModuleProvider providers={[Child]}>
                    <Rebuilder capture={(fn) => (rebuildChild = fn)} />
                </ModuleProvider>
            </ModuleProvider>
        )
        log.length = 0

        await act(async () => {
            rebuildChild?.()
        })
        await flush()

        expect(log).toEqual(["C:ctor", "C:init", "C:unmount", "C:destroy", "C:mount"])
        expect(Parent.counts).toEqual({ init: 1, mount: 1, unmount: 0, destroy: 0 })
    })

    it("does not rebuild a nested root module when its parent container changes", async () => {
        // `root` opts out of the parent-container cascade, so it heads its own lifecycle tree: it never
        // attaches to the ancestor's registry, and the outgoing parent's destroy cannot claim it.
        const log: string[] = []
        const Child = tracked(log, "C")
        const childContainers: Container[] = []
        let rebuild: (() => void) | null = null

        function ChildProbe(): ReactNode {
            childContainers.push(useModuleContext().container)
            return null
        }

        render(
            <ModuleProvider root>
                <Rebuilder capture={(fn) => (rebuild = fn)} />
                <ModuleProvider root providers={[Child]}>
                    <ChildProbe />
                </ModuleProvider>
            </ModuleProvider>
        )
        log.length = 0

        await act(async () => {
            rebuild?.()
        })
        await flush()

        expect(new Set(childContainers).size).toBe(1)
        expect(Child.counts).toEqual({ init: 1, mount: 1, unmount: 0, destroy: 0 })
        expect(log).toEqual([])
    })

    it("does not rebuild or destroy a nested factory module when its parent container changes", async () => {
        const log: string[] = []
        const Child = tracked(log, "C")
        const childContainers: Container[] = []
        let rebuild: (() => void) | null = null

        function ChildProbe(): ReactNode {
            childContainers.push(useModuleContext().container)
            return null
        }

        render(
            <ModuleProvider root>
                <Rebuilder capture={(fn) => (rebuild = fn)} />
                <ModuleProvider factory={() => new Container()} providers={[Child]}>
                    <ChildProbe />
                </ModuleProvider>
            </ModuleProvider>
        )
        log.length = 0

        await act(async () => {
            rebuild?.()
        })
        await flush()

        expect(new Set(childContainers).size).toBe(1)
        expect(Child.counts).toEqual({ init: 1, mount: 1, unmount: 0, destroy: 0 })
        expect(log).toEqual([])
    })
})
