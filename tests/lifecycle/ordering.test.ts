import { describe, expect, it } from "vitest"

import { Container, Inject, Injectable, decorate } from "../../src/container/index.js"
import type { Constructor, Provider } from "../../src/container/index.js"
import { createModuleResolution } from "../../src/core/module/resolution.js"
import { ModuleLifecycle } from "../../src/core/providers/module-lifecycle/module-lifecycle.provider.js"
import { phase, tracked } from "../setup/helpers.js"

// Phase ordering.
// ========================================
//
// The orchestrator is driven directly here, exactly as useModule drives it: `createModuleResolution`
// runs init, then mount / unmount / destroy are signalled by hand in whatever order we want.

const lifecycleOf = (container: Container): ModuleLifecycle => container.resolve(ModuleLifecycle)

describe("init", () => {
    it("runs in creation order across a tree", () => {
        const log: string[] = []
        const parent = createModuleResolution(null, { root: true, providers: [tracked(log, "P")] })
        createModuleResolution(parent.container, { providers: [tracked(log, "C1")] })
        createModuleResolution(parent.container, { providers: [tracked(log, "C2")] })

        expect(phase(log, "init")).toEqual(["P:init", "C1:init", "C2:init"])
    })

    it("runs at resolution time, before any mount signal", () => {
        const log: string[] = []
        const module = createModuleResolution(null, { root: true, providers: [tracked(log, "A")] })

        expect(log).toEqual(["A:ctor", "A:init"])
        lifecycleOf(module.container).mount()
        expect(log).toEqual(["A:ctor", "A:init", "A:mount"])
    })

    it("runs providers in declaration order within one module", () => {
        const log: string[] = []
        createModuleResolution(null, {
            root: true,
            providers: [tracked(log, "A"), tracked(log, "B"), tracked(log, "C")],
        })

        expect(phase(log, "init")).toEqual(["A:init", "B:init", "C:init"])
    })
})

describe("mount", () => {
    it("is parent-first even when the signals arrive child-first", () => {
        const log: string[] = []
        const parent = createModuleResolution(null, { root: true, providers: [tracked(log, "P")] })
        const first = createModuleResolution(parent.container, { providers: [tracked(log, "C1")] })
        const second = createModuleResolution(parent.container, { providers: [tracked(log, "C2")] })
        log.length = 0

        lifecycleOf(first.container).mount()
        lifecycleOf(second.container).mount()
        expect(log).toEqual([])

        lifecycleOf(parent.container).mount()
        expect(phase(log, "mount")).toEqual(["P:mount", "C1:mount", "C2:mount"])
    })

    it("is parent-first when the signals arrive parent-first", () => {
        const log: string[] = []
        const parent = createModuleResolution(null, { root: true, providers: [tracked(log, "P")] })
        const child = createModuleResolution(parent.container, { providers: [tracked(log, "C")] })
        log.length = 0

        lifecycleOf(parent.container).mount()
        lifecycleOf(child.container).mount()

        expect(phase(log, "mount")).toEqual(["P:mount", "C:mount"])
    })

    it("cascades through three levels signalled bottom-up", () => {
        const log: string[] = []
        const a = createModuleResolution(null, { root: true, providers: [tracked(log, "A")] })
        const b = createModuleResolution(a.container, { providers: [tracked(log, "B")] })
        const c = createModuleResolution(b.container, { providers: [tracked(log, "C")] })
        log.length = 0

        lifecycleOf(c.container).mount()
        lifecycleOf(b.container).mount()
        lifecycleOf(a.container).mount()

        expect(phase(log, "mount")).toEqual(["A:mount", "B:mount", "C:mount"])
    })

    it("mounts a late child immediately when the parent is already mounted", () => {
        const log: string[] = []
        const parent = createModuleResolution(null, { root: true, providers: [tracked(log, "P")] })
        lifecycleOf(parent.container).mount()
        log.length = 0

        const child = createModuleResolution(parent.container, { providers: [tracked(log, "C")] })
        expect(phase(log, "mount")).toEqual([])

        lifecycleOf(child.container).mount()
        expect(phase(log, "mount")).toEqual(["C:mount"])
    })

    it("mounts providers within a module in declaration order", () => {
        const log: string[] = []
        const module = createModuleResolution(null, {
            root: true,
            providers: [tracked(log, "A"), tracked(log, "B"), tracked(log, "C")],
        })
        log.length = 0

        lifecycleOf(module.container).mount()

        expect(log).toEqual(["A:mount", "B:mount", "C:mount"])
    })
})

describe("unmount", () => {
    it("reverses the whole tree, siblings included", () => {
        const log: string[] = []
        const parent = createModuleResolution(null, { root: true, providers: [tracked(log, "P")] })
        const first = createModuleResolution(parent.container, { providers: [tracked(log, "C1")] })
        const second = createModuleResolution(parent.container, { providers: [tracked(log, "C2")] })
        lifecycleOf(first.container).mount()
        lifecycleOf(second.container).mount()
        lifecycleOf(parent.container).mount()
        log.length = 0

        lifecycleOf(parent.container).unmount()

        expect(log).toEqual(["C2:unmount", "C1:unmount", "P:unmount"])
    })

    it("reverses provider order inside a module", () => {
        const log: string[] = []
        const module = createModuleResolution(null, {
            root: true,
            providers: [tracked(log, "A"), tracked(log, "B"), tracked(log, "C")],
        })
        lifecycleOf(module.container).mount()
        log.length = 0

        lifecycleOf(module.container).unmount()

        expect(log).toEqual(["C:unmount", "B:unmount", "A:unmount"])
    })

    it("walks a three-level tree from the leaf up", () => {
        const log: string[] = []
        const a = createModuleResolution(null, { root: true, providers: [tracked(log, "A")] })
        const b = createModuleResolution(a.container, { providers: [tracked(log, "B")] })
        const c = createModuleResolution(b.container, { providers: [tracked(log, "C")] })
        lifecycleOf(c.container).mount()
        lifecycleOf(b.container).mount()
        lifecycleOf(a.container).mount()
        log.length = 0

        lifecycleOf(a.container).unmount()

        expect(log).toEqual(["C:unmount", "B:unmount", "A:unmount"])
    })

    it("unmounts only the subtree that was signalled", () => {
        const log: string[] = []
        const parent = createModuleResolution(null, { root: true, providers: [tracked(log, "P")] })
        const child = createModuleResolution(parent.container, { providers: [tracked(log, "C")] })
        lifecycleOf(child.container).mount()
        lifecycleOf(parent.container).mount()
        log.length = 0

        lifecycleOf(child.container).unmount()

        expect(log).toEqual(["C:unmount"])
    })
})

describe("destroy", () => {
    it("reverses the whole tree, siblings included", async () => {
        const log: string[] = []
        const parent = createModuleResolution(null, { root: true, providers: [tracked(log, "P")] })
        const first = createModuleResolution(parent.container, { providers: [tracked(log, "C1")] })
        const second = createModuleResolution(parent.container, { providers: [tracked(log, "C2")] })
        lifecycleOf(first.container).mount()
        lifecycleOf(second.container).mount()
        lifecycleOf(parent.container).mount()
        lifecycleOf(parent.container).unmount()
        log.length = 0

        await lifecycleOf(parent.container).destroy()

        expect(log).toEqual(["C2:destroy", "C1:destroy", "P:destroy"])
    })

    it("reverses provider order inside a module", async () => {
        const log: string[] = []
        const module = createModuleResolution(null, {
            root: true,
            providers: [tracked(log, "A"), tracked(log, "B"), tracked(log, "C")],
        })
        lifecycleOf(module.container).mount()
        lifecycleOf(module.container).unmount()
        log.length = 0

        await lifecycleOf(module.container).destroy()

        expect(log).toEqual(["C:destroy", "B:destroy", "A:destroy"])
    })

    it("genuinely awaits each hook — a slow one blocks the fast one behind it", async () => {
        const log: string[] = []
        // Destroy runs in reverse, so the 25ms hook goes first. Fire-and-forget would let the 5ms hook
        // overtake it and log ["A:destroy", "B:destroy"].
        const module = createModuleResolution(null, {
            root: true,
            providers: [tracked(log, "A", { destroyDelay: 5 }), tracked(log, "B", { destroyDelay: 25 })],
        })
        lifecycleOf(module.container).mount()
        lifecycleOf(module.container).unmount()
        log.length = 0

        const started = Date.now()
        await lifecycleOf(module.container).destroy()
        const elapsed = Date.now() - started

        expect(log).toEqual(["B:destroy", "A:destroy"])
        expect(elapsed).toBeGreaterThanOrEqual(25)
    })

    it("awaits across modules, not just within one", async () => {
        const log: string[] = []
        const parent = createModuleResolution(null, {
            root: true,
            providers: [tracked(log, "P", { destroyDelay: 5 })],
        })
        const child = createModuleResolution(parent.container, {
            providers: [tracked(log, "C", { destroyDelay: 25 })],
        })
        lifecycleOf(child.container).mount()
        lifecycleOf(parent.container).mount()
        lifecycleOf(parent.container).unmount()
        log.length = 0

        await lifecycleOf(parent.container).destroy()

        expect(log).toEqual(["C:destroy", "P:destroy"])
    })

    it("destroys only the subtree that was signalled, and the parent survives", async () => {
        const log: string[] = []
        const parent = createModuleResolution(null, { root: true, providers: [tracked(log, "P")] })
        const child = createModuleResolution(parent.container, { providers: [tracked(log, "C")] })
        lifecycleOf(child.container).mount()
        lifecycleOf(parent.container).mount()
        lifecycleOf(child.container).unmount()
        log.length = 0

        await lifecycleOf(child.container).destroy()
        expect(log).toEqual(["C:destroy"])

        lifecycleOf(parent.container).unmount()
        await lifecycleOf(parent.container).destroy()
        expect(log).toEqual(["C:destroy", "P:unmount", "P:destroy"])
    })
})

describe("construction order", () => {
    it("destroys a dependent before the dependency it injected", async () => {
        const log: string[] = []
        const DEPENDENCY = Symbol("dependency")
        const dependency = tracked(log, "Dependency")

        class Dependent {
            constructor(readonly dependency: unknown) {
                log.push("Dependent:ctor")
            }
            onModuleDestroy(): void {
                log.push("Dependent:destroy")
            }
        }
        decorate(Injectable(), Dependent)
        decorate(Inject(DEPENDENCY) as ParameterDecorator, Dependent as Constructor, 0)

        // Declared dependent-first; construction order is still dependency-first, and that is what the
        // lifecycle records.
        const module = createModuleResolution(null, {
            root: true,
            providers: [
                { provide: Dependent, useClass: Dependent } as Provider,
                { provide: DEPENDENCY, useClass: dependency } as Provider,
            ],
        })

        expect(phase(log, "ctor")).toEqual(["Dependency:ctor", "Dependent:ctor"])

        lifecycleOf(module.container).mount()
        lifecycleOf(module.container).unmount()
        log.length = 0
        await lifecycleOf(module.container).destroy()

        expect(log).toEqual(["Dependent:destroy", "Dependency:destroy"])
    })
})

describe("module hooks", () => {
    it("brackets the provider hooks — first up, last down", async () => {
        const log: string[] = []
        const module = createModuleResolution(null, {
            root: true,
            providers: [tracked(log, "svc")],
            onModuleInit: () => log.push("module:init"),
            onModuleMount: () => log.push("module:mount"),
            onModuleUnmount: () => log.push("module:unmount"),
            onModuleDestroy: () => log.push("module:destroy"),
        })

        lifecycleOf(module.container).mount()
        lifecycleOf(module.container).unmount()
        await lifecycleOf(module.container).destroy()

        expect(log.filter((entry) => !entry.endsWith(":ctor"))).toEqual([
            "module:init",
            "svc:init",
            "module:mount",
            "svc:mount",
            "svc:unmount",
            "module:unmount",
            "svc:destroy",
            "module:destroy",
        ])
    })

    it("hands the module container to every hook", async () => {
        const seen: unknown[] = []
        const module = createModuleResolution(null, {
            root: true,
            onModuleInit: (container) => seen.push(container),
            onModuleMount: (container) => seen.push(container),
            onModuleUnmount: (container) => seen.push(container),
            onModuleDestroy: (container) => seen.push(container),
        })

        lifecycleOf(module.container).mount()
        lifecycleOf(module.container).unmount()
        await lifecycleOf(module.container).destroy()

        expect(seen).toEqual([module.container, module.container, module.container, module.container])
    })

    it("awaits an async module destroy hook", async () => {
        const log: string[] = []
        const module = createModuleResolution(null, {
            root: true,
            providers: [tracked(log, "svc")],
            onModuleDestroy: async () => {
                await new Promise((resolve) => setTimeout(resolve, 20))
                log.push("module:destroy")
            },
        })
        lifecycleOf(module.container).mount()
        lifecycleOf(module.container).unmount()
        log.length = 0

        await lifecycleOf(module.container).destroy()

        expect(log).toEqual(["svc:destroy", "module:destroy"])
    })
})
