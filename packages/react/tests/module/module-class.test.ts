import { describe, expect, it } from "vitest"

import { Container } from "@remodulo/container"
import { App, Module } from "../../src/core/module/module.js"
import { ModuleLifecycle } from "../../src/core/providers/module-lifecycle/module-lifecycle.provider.js"
import { LIFECYCLE } from "../../src/core/providers/module-lifecycle/module-lifecycle.token.js"
import { ModuleTraversal } from "../../src/core/providers/module-traversal/module-traversal.provider.js"
import { Resolver } from "../../src/core/providers/resolver/resolver.provider.js"
import { makeApp, makeChild, phase, plain, tracked } from "../setup/helpers.js"

// The Module / App classes.
// ========================================
//
// Construction and init are two steps now: `new Module(...)` builds the container and registers, `init()`
// arms the lifecycle. Nothing runs a user hook until `init()`, `init()` is idempotent, and a child cannot
// be built from a parent that has not been initialized.

const PARENT_ONLY = Symbol.for("tests.module.parent-only")
const CHILD_ONLY = Symbol.for("tests.module.child-only")

describe("construction", () => {
    it("builds a fresh container for an App and forks the parent's for a child", () => {
        const app = makeApp({ providers: [{ provide: PARENT_ONLY, useValue: "parent" }] })
        const child = new Module(app, { providers: [{ provide: CHILD_ONLY, useValue: "child" }] })

        expect(app.container).toBeInstanceOf(Container)
        expect(child.container).toBeInstanceOf(Container)
        expect(child.container).not.toBe(app.container)

        // Reads travel up the fork chain, writes do not travel down.
        expect(child.container.resolve(PARENT_ONLY)).toBe("parent")
        expect(child.container.isRegistered(PARENT_ONLY, "self")).toBe(false)
        expect(app.container.isRegistered(CHILD_ONLY)).toBe(false)
    })

    it("registers the four system providers on its own container", () => {
        const module = new App()
        const own = (token: Parameters<Container["isRegistered"]>[0]) => module.container.isRegistered(token, "self")

        expect([own(Module), own(Resolver), own(ModuleTraversal), own(LIFECYCLE)]).toEqual([true, true, true, true])
    })

    it("registers the very lifecycle that drives the module's phases, not a second one", () => {
        const module = makeApp()
        const lifecycle = module.container.resolve(LIFECYCLE)

        expect(lifecycle).toBeInstanceOf(ModuleLifecycle)
        expect(lifecycle.initialized).toBe(true)

        module.mount()
        expect(lifecycle.mounted).toBe(true)
    })

    // Hooks are handed to the lifecycle at ITS construction, not at `init()`. So the lifecycle is fully
    // armed the moment it exists, and driving the phases through the registered instance — bypassing
    // `Module.init()`, which is now nothing but a delegating phase transition — fires them all the same.
    // Under the old `init(hooks?)` plumbing this drive lost every module hook: no argument, no hooks.
    it("carries the params' module hooks from construction, even when the phases are driven through it", async () => {
        const log: string[] = []
        const module = new App({
            providers: [tracked(log, "svc")],
            onModuleInit: () => log.push("module:init"),
            onModuleMount: () => log.push("module:mount"),
            onModuleUnmount: () => log.push("module:unmount"),
            onModuleDestroy: () => log.push("module:destroy"),
        })
        const lifecycle = module.container.resolve(LIFECYCLE)

        lifecycle.init()
        lifecycle.mount()
        lifecycle.unmount()
        await lifecycle.destroy()

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

    it("registers itself under the Module token, resolvable directly and through the Resolver", () => {
        const module = new App({ id: "wired" })

        expect(module.container.resolve(Module)).toBe(module)
        expect(module.container.resolve(Resolver).resolve(Module)).toBe(module)
        expect(module.container.resolve(ModuleTraversal)).toBeInstanceOf(ModuleTraversal)
    })

    it("registers user providers alongside the system ones", () => {
        const Plain = plain("wired")
        const module = new App({ providers: [Plain, { provide: CHILD_ONLY, useValue: 7 }] })

        expect(module.container.isRegistered(Plain as never, "self")).toBe(true)
        expect(module.container.resolve(CHILD_ONLY)).toBe(7)
    })

    it("does not init — no provider is constructed until init()", () => {
        const log: string[] = []
        const module = new App({ providers: [tracked(log, "A")] })

        expect(log).toEqual([])
        expect(module.initialized).toBe(false)

        module.init()
        expect(log).toEqual(["A:ctor", "A:init"])
        expect(module.initialized).toBe(true)
    })

    it("throws when a child is built from an un-initialized parent", () => {
        const parent = new App()

        expect(() => new Module(parent, {})).toThrowError(
            "Cannot create a child module from an un-initialized parent — its lifecycle is not armed yet, so instances would leak. Init the parent first."
        )

        parent.init()
        expect(() => new Module(parent, {})).not.toThrow()
    })
})

describe("init", () => {
    it("is idempotent — a second init runs nothing again", () => {
        const log: string[] = []
        const service = tracked(log, "A")
        const module = new App({ providers: [service], onModuleInit: () => log.push("module:init") })

        module.init()
        module.init()

        expect(service.counts.init).toBe(1)
        expect(log).toEqual(["A:ctor", "module:init", "A:init"])
    })

    it("runs providers in declaration order, module hook first", () => {
        const log: string[] = []
        makeApp({
            providers: [tracked(log, "A"), tracked(log, "B")],
            onModuleInit: () => log.push("module:init"),
        })

        // `phase(log, "init")` would also catch "module:init"; the full order below is the real assertion.
        expect(log.filter((e) => !e.endsWith(":ctor"))).toEqual(["module:init", "A:init", "B:init"])
    })
})

// `children` is a live `Set` underneath, so the guarantee is entirely in the type: the mutators are not on
// it. Checked by `typecheck:tests`, and again against the published declarations in the consumer fixtures.
// Nothing here is ever called.
function childrenRefusesMutation(module: Module, child: Module): void {
    // @ts-expect-error a ReadonlySet has no `add`.
    module.children.add(child)
    // @ts-expect-error and no `delete` either.
    module.children.delete(child)
}
void childrenRefusesMutation

describe("children", () => {
    it("attaches and detaches through addChild/removeChild", () => {
        const parent = makeApp({ id: "parent" })
        const child = new Module(parent, { id: "child" })

        parent.addChild(child)
        expect([...parent.children]).toEqual([child])

        parent.removeChild(child)
        expect(parent.children.size).toBe(0)
    })

    it("is the very set the module keeps, not a copy taken per read", () => {
        const parent = makeApp({ id: "parent" })
        const view = parent.children
        const child = new Module(parent, { id: "child" })

        parent.addChild(child)

        expect(view.has(child)).toBe(true)
        expect(parent.children).toBe(view)
    })
})

describe("state getters", () => {
    it("tracks initialized and mounted across the phases", async () => {
        const module = makeApp()

        expect(module.initialized).toBe(true)
        expect(module.mounted).toBe(false)

        module.mount()
        expect(module.mounted).toBe(true)

        module.unmount()
        expect(module.mounted).toBe(false)

        await module.destroy()
        expect(module.mounted).toBe(false)
    })

    // `destroyed` is the public end-state read; `claimed` is the mid-destroy bookkeeping behind it and is
    // now `@internal`. The two differ only inside `destroy()`, which is why the flag flips before the await.
    it("reports destroyed only once destroy has resolved", async () => {
        const module = makeApp()

        expect(module.destroyed).toBe(false)

        const destroying = module.destroy()
        await destroying

        expect(module.destroyed).toBe(true)
    })

    it("stays destroyed across a repeated destroy", async () => {
        const module = makeApp()

        await module.destroy()
        await module.destroy()

        expect(module.destroyed).toBe(true)
    })

    // Children link into the tree at mount, so the whole tree is mounted before the destroy — an
    // un-mounted child is not reachable from its parent and would not be claimed at all.
    it("covers the claimed subtree and stops at it", async () => {
        const root = makeApp()
        const kept = makeChild(root)
        const doomed = makeChild(root)
        const grandchild = makeChild(doomed)

        grandchild.mount()
        doomed.mount()
        kept.mount()
        root.mount()

        await doomed.destroy()

        expect([doomed.destroyed, grandchild.destroyed]).toEqual([true, true])
        expect([root.destroyed, kept.destroyed]).toEqual([false, false])
    })
})

describe("App", () => {
    it("pins parent to null", () => {
        const app = new App({ id: "root" })

        expect(app.parent).toBeNull()
        expect(app).toBeInstanceOf(Module)
    })

    it("new App returns an App instance", () => {
        const app = new App({ id: "made" })

        expect(app).toBeInstanceOf(App)
        expect(app.parent).toBeNull()
        expect(app.id).toBe("made")
    })

    it("records the context parent on a child", () => {
        const parent = makeApp({ id: "parent" })
        const child = new Module(parent, { id: "child" })

        expect(child.parent).toBe(parent)
        expect(child.id).toBe("child")
    })
})

describe("ids", () => {
    it("uses params.id verbatim", () => {
        expect(new App({ id: "feature:checkout" }).id).toBe("feature:checkout")
    })

    it("generates an id when none is supplied", () => {
        expect(new App().id).toMatch(/^id:\d+$/)
    })

    it("does not deduplicate two modules asking for the same id", () => {
        const a = new App({ id: "same" })
        const b = new App({ id: "same" })

        expect(a.id).toBe("same")
        expect(b.id).toBe("same")
        expect(a.container).not.toBe(b.container)
    })

    it("generates a distinct id per construction", () => {
        const ids = Array.from({ length: 25 }, () => new App().id)

        expect(new Set(ids).size).toBe(25)
    })
})

describe("four-phase drive across a tree", () => {
    it("mounts parent-first, tears down child-first", async () => {
        const log: string[] = []
        const root = makeApp({ providers: [tracked(log, "R")] })
        const child = new Module(root, { providers: [tracked(log, "C")] })
        child.init()
        log.length = 0

        child.mount()
        root.mount()
        expect(phase(log, "mount")).toEqual(["R:mount", "C:mount"])

        root.unmount()
        expect(phase(log, "unmount")).toEqual(["C:unmount", "R:unmount"])

        await root.destroy()
        expect(phase(log, "destroy")).toEqual(["C:destroy", "R:destroy"])
    })
})
