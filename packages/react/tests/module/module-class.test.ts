import { describe, expect, it } from "vitest"

import { Container } from "../../src/container/index.js"
import { App, Module } from "../../src/core/module/module.js"
import { ModuleLifecycle } from "../../src/core/providers/module-lifecycle/module-lifecycle.provider.js"
import { ModuleRegistry } from "../../src/core/providers/module-registry/module-registry.provider.js"
import { Resolver } from "../../src/core/providers/resolver/resolver.provider.js"
import { makeApp, phase, plain, tracked } from "../setup/helpers.js"

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

        expect([own(Module), own(Resolver), own(ModuleRegistry), own(ModuleLifecycle)]).toEqual([
            true,
            true,
            true,
            true,
        ])
    })

    it("registers itself under the Module token, resolvable directly and through the Resolver", () => {
        const module = new App({ id: "wired" })

        expect(module.container.resolve(Module)).toBe(module)
        expect(module.container.resolve(Resolver).resolve(Module)).toBe(module)
        expect(module.container.resolve(ModuleRegistry)).toBeInstanceOf(ModuleRegistry)
        expect(module.container.resolve(ModuleLifecycle)).toBeInstanceOf(ModuleLifecycle)
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
