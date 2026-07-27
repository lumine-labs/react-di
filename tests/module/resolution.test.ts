import { describe, expect, it } from "vitest"

import { Container } from "../../src/container/index.js"
import { assertParams, createModuleResolution, resolveContainer } from "../../src/core/module/resolution.js"
import { ModuleLifecycle } from "../../src/core/providers/module-lifecycle/module-lifecycle.provider.js"
import { ModuleMetadata } from "../../src/core/providers/module-metadata/module-metadata.provider.js"
import { ModuleRegistry } from "../../src/core/providers/module-registry/module-registry.provider.js"
import { Resolver } from "../../src/core/providers/resolver/resolver.provider.js"
import { plain, tracked } from "../setup/helpers.js"

// createModuleResolution — the three modes
// ========================================
//
// `root` builds a fresh container, `factory` adopts a supplied one, and everything else forks the parent.
// The mode is decided by params alone: a `root` module nested under another module still gets a fresh
// container and cannot see anything the outer module registered.

const PARENT_ONLY = Symbol.for("tests.resolution.parent-only")
const CHILD_ONLY = Symbol.for("tests.resolution.child-only")

function messageOf(fn: () => unknown): string {
    try {
        fn()
    } catch (error) {
        return (error as Error).message
    }
    throw new Error("expected the call to throw, it did not")
}

describe("createModuleResolution — root mode", () => {
    it("builds a fresh container that is not derived from the parent", () => {
        const parent = createModuleResolution(null, {
            root: true,
            providers: [{ provide: PARENT_ONLY, useValue: "parent" }],
        })

        const module = createModuleResolution(parent.container, { root: true })

        expect(module.container).toBeInstanceOf(Container)
        expect(module.container).not.toBe(parent.container)
        expect(module.container.isRegistered(PARENT_ONLY)).toBe(false)
        expect(parent.container.isRegistered(PARENT_ONLY)).toBe(true)
    })

    it("records no parent on its metadata, even nested under another module", () => {
        const parent = createModuleResolution(null, { root: true })
        const module = createModuleResolution(parent.container, { root: true })

        // A root heads its own tree. Keeping the context parent here would let the outer module's destroy
        // claim this subtree, and useModule never rebuilds a root when its context container changes.
        expect(module.container.resolve(ModuleMetadata).parent).toBeNull()
    })

    it("has no parent recorded when there is no module in context", () => {
        const module = createModuleResolution(null, { root: true })

        expect(module.container.resolve(ModuleMetadata).parent).toBeNull()
    })
})

describe("createModuleResolution — factory mode", () => {
    it("adopts the container the factory returns, by identity", () => {
        const supplied = new Container()
        let calls = 0

        const module = createModuleResolution(null, {
            factory: () => {
                calls += 1
                return supplied
            },
        })

        expect(module.container).toBe(supplied)
        expect(calls).toBe(1)
    })

    it("keeps whatever the supplied container already had bound", () => {
        const supplied = new Container()
        supplied.register({ provide: PARENT_ONLY, useValue: "pre-bound" })

        const module = createModuleResolution(null, { factory: () => supplied })

        expect(module.container.resolve(PARENT_ONLY)).toBe("pre-bound")
    })

    it("ignores the context parent — a factory container is a root", () => {
        const parent = createModuleResolution(null, {
            root: true,
            providers: [{ provide: PARENT_ONLY, useValue: "parent" }],
        })

        const module = createModuleResolution(parent.container, { factory: () => new Container() })

        expect(module.container.isRegistered(PARENT_ONLY)).toBe(false)
    })

    it("throws when the factory returns a falsy container", () => {
        expect(messageOf(() => createModuleResolution(null, { factory: () => null as unknown as Container }))).toBe(
            "factory() returned falsy."
        )
    })
})

describe("createModuleResolution — scoped mode", () => {
    it("forks the parent container", () => {
        const parent = createModuleResolution(null, {
            root: true,
            providers: [{ provide: PARENT_ONLY, useValue: "parent" }],
        })

        const module = createModuleResolution(parent.container, {
            providers: [{ provide: CHILD_ONLY, useValue: "child" }],
        })

        expect(module.container).toBeInstanceOf(Container)
        expect(module.container).not.toBe(parent.container)

        // Reads travel up the chain, writes do not travel down.
        expect(module.container.resolve(PARENT_ONLY)).toBe("parent")
        expect(module.container.isRegistered(PARENT_ONLY, false)).toBe(false)
        expect(parent.container.isRegistered(CHILD_ONLY)).toBe(false)
    })

    it("shadows a parent token with its own registration", () => {
        const parent = createModuleResolution(null, {
            root: true,
            providers: [{ provide: PARENT_ONLY, useValue: "parent" }],
        })
        const module = createModuleResolution(parent.container, {
            providers: [{ provide: PARENT_ONLY, useValue: "child" }],
        })

        expect(module.container.resolve(PARENT_ONLY)).toBe("child")
        expect(parent.container.resolve(PARENT_ONLY)).toBe("parent")
    })

    it("throws when there is no parent container in context", () => {
        expect(messageOf(() => createModuleResolution(null))).toBe(
            "No parent container in context. Provide `root` or `factory` for a root module."
        )
    })

    it("throws for an empty params object with no parent, same as no params at all", () => {
        expect(messageOf(() => createModuleResolution(null, { id: "orphan" }))).toBe(
            "No parent container in context. Provide `root` or `factory` for a root module."
        )
    })
})

describe("createModuleResolution — mode conflicts", () => {
    it("throws when `root` and `factory` are combined", () => {
        const params = { root: true, factory: () => new Container() } as never

        expect(messageOf(() => createModuleResolution(null, params))).toBe("`root` cannot be used with `factory`.")
    })

    it("rejects the combination before the factory is ever called", () => {
        let calls = 0
        const params = {
            root: true,
            factory: () => {
                calls += 1
                return new Container()
            },
        } as never

        expect(() => createModuleResolution(null, params)).toThrowError()
        expect(calls).toBe(0)
    })

    it("assertParams accepts each mode on its own", () => {
        expect(() => assertParams()).not.toThrow()
        expect(() => assertParams({ root: true })).not.toThrow()
        expect(() => assertParams({ factory: () => new Container() })).not.toThrow()
        expect(() => assertParams({ id: "scoped" })).not.toThrow()
    })
})

describe("resolveContainer", () => {
    it("returns a fresh container for root, the factory container for factory, a fork otherwise", () => {
        const parent = new Container()
        const supplied = new Container()

        const rootContainer = resolveContainer(parent, { root: true })
        const factoryContainer = resolveContainer(parent, { factory: () => supplied })
        const scopedContainer = resolveContainer(parent)

        expect(rootContainer).not.toBe(parent)
        expect(rootContainer).not.toBe(supplied)
        expect(factoryContainer).toBe(supplied)
        expect(scopedContainer).not.toBe(parent)
        expect(scopedContainer).toBeInstanceOf(Container)
    })
})

describe("module ids", () => {
    it("uses `params.id` verbatim", () => {
        const module = createModuleResolution(null, { root: true, id: "feature:checkout" })

        expect(module.id).toBe("feature:checkout")
        expect(module.container.resolve(ModuleMetadata).id).toBe("feature:checkout")
    })

    it("does not deduplicate two modules asking for the same id", () => {
        const a = createModuleResolution(null, { root: true, id: "same" })
        const b = createModuleResolution(null, { root: true, id: "same" })

        expect(a.id).toBe("same")
        expect(b.id).toBe("same")
        expect(a.container).not.toBe(b.container)
    })

    it("generates an id when none is supplied", () => {
        const module = createModuleResolution(null, { root: true })

        expect(module.id).toMatch(/^id:\d+$/)
        expect(module.container.resolve(ModuleMetadata).id).toBe(module.id)
    })

    it("generates a distinct id per resolution", () => {
        const ids = Array.from({ length: 25 }, () => createModuleResolution(null, { root: true }).id)

        expect(new Set(ids).size).toBe(25)
    })
})

describe("module wiring", () => {
    it("registers exactly the four system providers on the module's own container", () => {
        const module = createModuleResolution(null, { root: true })
        const own = (token: Parameters<Container["isRegistered"]>[0]) => module.container.isRegistered(token, false)

        expect([own(Resolver), own(ModuleMetadata), own(ModuleRegistry), own(ModuleLifecycle)]).toEqual([
            true,
            true,
            true,
            true,
        ])
    })

    it("wires the system providers to this module's container", () => {
        const module = createModuleResolution(null, { root: true, id: "wired" })
        const metadata = module.container.resolve(ModuleMetadata)

        expect(metadata.container).toBe(module.container)
        expect(metadata.id).toBe(module.id)
        expect(module.container.resolve(Resolver).resolve(ModuleMetadata)).toBe(metadata)
        expect(module.container.resolve(ModuleRegistry)).toBeInstanceOf(ModuleRegistry)
        expect(module.container.resolve(ModuleLifecycle)).toBeInstanceOf(ModuleLifecycle)
    })

    it("registers user providers alongside them", () => {
        const Plain = plain("wired")
        const module = createModuleResolution(null, {
            root: true,
            providers: [Plain, { provide: CHILD_ONLY, useValue: 7 }],
        })

        expect(module.container.isRegistered(Plain as never, false)).toBe(true)
        expect(module.container.resolve(CHILD_ONLY)).toBe(7)
    })

    it("runs the init phase during resolution and nothing later", () => {
        const log: string[] = []
        const Service = tracked(log, "S")

        createModuleResolution(null, { root: true, providers: [Service] })

        expect(log).toEqual(["S:ctor", "S:init"])
        expect(Service.counts).toEqual({ init: 1, mount: 0, unmount: 0, destroy: 0 })
    })

    it("passes the module hooks through to the lifecycle", () => {
        const log: string[] = []
        const module = createModuleResolution(null, {
            root: true,
            onModuleInit: () => log.push("module:init"),
            onModuleMount: () => log.push("module:mount"),
        })

        expect(log).toEqual(["module:init"])

        module.container.resolve(ModuleLifecycle).mount()
        expect(log).toEqual(["module:init", "module:mount"])
    })

    it("returns the container and the id, and nothing else", () => {
        const module = createModuleResolution(null, { root: true, id: "shape" })

        expect(Object.keys(module).sort()).toEqual(["container", "id"])
    })
})
