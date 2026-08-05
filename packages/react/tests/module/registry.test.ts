import { beforeEach, describe, expect, it } from "vitest"

import { Container } from "@remodulo/container"
import { App, Module } from "../../src/core/module/module.js"
import { ModuleRegistry } from "../../src/core/providers/module-registry/module-registry.provider.js"
import { makeApp, makeChild } from "../setup/helpers.js"

// ModuleRegistry traversal
// ========================================
//
//   root ──┬── a ──┬── a1
//          │       └── a2
//          └── b
//
// Every traversal method deals in `Container` — ids and tokens are lookup keys, never return values.
// The tree is built from `module.parent`, and a node only becomes visible to its parent once it has mounted.

const SHARED = Symbol.for("tests.registry.shared")
const ROOT_ONLY = Symbol.for("tests.registry.root-only")
const DEEP = Symbol.for("tests.registry.deep")
const NOWHERE = Symbol.for("tests.registry.nowhere")

type Tree = { root: Module; a: Module; a1: Module; a2: Module; b: Module }

let tree: Tree

function registryOf(module: Module): ModuleRegistry {
    return module.container.resolve(ModuleRegistry)
}

beforeEach(() => {
    const root = makeApp({
        id: "root",
        providers: [
            { provide: SHARED, useValue: "root" },
            { provide: ROOT_ONLY, useValue: "root-only" },
        ],
    })
    const a = makeChild(root, { id: "a", providers: [{ provide: SHARED, useValue: "a" }] })
    const a1 = makeChild(a, { id: "a1" })
    const a2 = makeChild(a, { id: "a2", providers: [{ provide: DEEP, useValue: "a2" }] })
    const b = makeChild(root, { id: "b", providers: [{ provide: DEEP, useValue: "b" }] })

    // React mounts depth-first: leaves commit before their parents, siblings in render order.
    for (const module of [a1, a2, a, b, root]) module.mount()

    tree = { root, a, a1, a2, b }
})

describe("ModuleRegistry — parent", () => {
    it("returns the parent container", () => {
        expect(registryOf(tree.a1).parent()).toBe(tree.a.container)
        expect(registryOf(tree.a).parent()).toBe(tree.root.container)
        expect(registryOf(tree.a1).parent()).toBeInstanceOf(Container)
    })

    it("returns null at an App root", () => {
        expect(registryOf(tree.root).parent()).toBeNull()
    })
})

describe("ModuleRegistry — ancestors", () => {
    it("lists ancestors nearest first, excluding self", () => {
        expect(registryOf(tree.a1).ancestors()).toEqual([tree.a.container, tree.root.container])
        expect(registryOf(tree.a).ancestors()).toEqual([tree.root.container])
    })

    it("is empty at a root", () => {
        expect(registryOf(tree.root).ancestors()).toEqual([])
    })

    it("does not depend on mounting — the chain is structural, not attachment", () => {
        const root = makeApp({ id: "unmounted-root" })
        const child = makeChild(root, { id: "unmounted-child" })

        expect(registryOf(child).ancestors()).toEqual([root.container])
    })
})

describe("ModuleRegistry — findRoot", () => {
    it("returns the outermost module of the tree", () => {
        expect(registryOf(tree.a1).findRoot()).toBe(tree.root.container)
        expect(registryOf(tree.b).findRoot()).toBe(tree.root.container)
    })

    it("returns its own container when it is already the root", () => {
        expect(registryOf(tree.root).findRoot()).toBe(tree.root.container)
    })
})

describe("ModuleRegistry — children", () => {
    it("lists direct children only, in attach order", () => {
        expect(registryOf(tree.root).children()).toEqual([tree.a.container, tree.b.container])
        expect(registryOf(tree.a).children()).toEqual([tree.a1.container, tree.a2.container])
    })

    it("is empty for a leaf", () => {
        expect(registryOf(tree.a1).children()).toEqual([])
    })

    it("only sees children that have mounted", () => {
        const late = makeChild(tree.root, { id: "late" })

        expect(registryOf(tree.root).children()).toEqual([tree.a.container, tree.b.container])

        late.mount()
        expect(registryOf(tree.root).children()).toEqual([tree.a.container, tree.b.container, late.container])
    })

    it("returns Containers", () => {
        for (const child of registryOf(tree.root).children()) {
            expect(child).toBeInstanceOf(Container)
        }
    })
})

describe("ModuleRegistry — descendants", () => {
    it("walks depth-first, excluding self", () => {
        expect(registryOf(tree.root).descendants()).toEqual([
            tree.a.container,
            tree.a1.container,
            tree.a2.container,
            tree.b.container,
        ])
    })

    it("is scoped to the subtree it is asked from", () => {
        expect(registryOf(tree.a).descendants()).toEqual([tree.a1.container, tree.a2.container])
        expect(registryOf(tree.b).descendants()).toEqual([])
    })

    it("only sees mounted nodes", async () => {
        makeChild(tree.b, { id: "unmounted" })
        expect(registryOf(tree.root).descendants()).toEqual([
            tree.a.container,
            tree.a1.container,
            tree.a2.container,
            tree.b.container,
        ])

        await tree.a2.destroy()
        expect(registryOf(tree.root).descendants()).toEqual([tree.a.container, tree.a1.container, tree.b.container])
    })

    it("returns Containers", () => {
        for (const descendant of registryOf(tree.root).descendants()) {
            expect(descendant).toBeInstanceOf(Container)
        }
    })
})

describe("ModuleRegistry — lookup by id", () => {
    it("finds an ancestor by id", () => {
        expect(registryOf(tree.a1).findAncestorById("a")).toBe(tree.a.container)
        expect(registryOf(tree.a1).findAncestorById("root")).toBe(tree.root.container)
    })

    it("returns null for an id that is not an ancestor", () => {
        expect(registryOf(tree.a1).findAncestorById("b")).toBeNull()
        expect(registryOf(tree.a1).findAncestorById("a1")).toBeNull()
        expect(registryOf(tree.a1).findAncestorById("missing")).toBeNull()
    })

    it("finds a descendant by id", () => {
        expect(registryOf(tree.root).findDescendantById("a2")).toBe(tree.a2.container)
        expect(registryOf(tree.root).findDescendantById("b")).toBe(tree.b.container)
    })

    it("returns null for an id that is not a descendant", () => {
        expect(registryOf(tree.root).findDescendantById("root")).toBeNull()
        expect(registryOf(tree.a).findDescendantById("b")).toBeNull()
        expect(registryOf(tree.a1).findDescendantById("a")).toBeNull()
    })

    it("returns the nearest match when two ancestors share an id", () => {
        const outer = makeApp({ id: "dup" })
        const middle = makeChild(outer, { id: "dup" })
        const leaf = makeChild(middle, { id: "leaf" })

        expect(registryOf(leaf).findAncestorById("dup")).toBe(middle.container)
    })
})

describe("ModuleRegistry — lookup by provider", () => {
    it("finds the nearest ancestor that registers the token itself", () => {
        // `a` shadows the root's SHARED, and the ancestor search asks each container non-recursively,
        // so the nearest declaring module wins rather than the first one that can merely resolve it.
        expect(registryOf(tree.a1).findAncestorByProvider(SHARED)).toBe(tree.a.container)
        expect(registryOf(tree.a1).findAncestorByProvider(ROOT_ONLY)).toBe(tree.root.container)
    })

    it("does not count a token it owns itself", () => {
        expect(registryOf(tree.a).findAncestorByProvider(SHARED)).toBe(tree.root.container)
    })

    it("returns null when no ancestor declares the token", () => {
        expect(registryOf(tree.a1).findAncestorByProvider(NOWHERE)).toBeNull()
        expect(registryOf(tree.a1).findAncestorByProvider(DEEP)).toBeNull()
        expect(registryOf(tree.root).findAncestorByProvider(SHARED)).toBeNull()
    })

    it("finds every descendant declaring the token, depth-first", () => {
        expect(registryOf(tree.root).findDescendantsByProvider(DEEP)).toEqual([tree.a2.container, tree.b.container])
    })

    it("excludes self and reports an empty list when nobody below declares it", () => {
        expect(registryOf(tree.root).findDescendantsByProvider(SHARED)).toEqual([tree.a.container])
        expect(registryOf(tree.root).findDescendantsByProvider(ROOT_ONLY)).toEqual([])
        expect(registryOf(tree.root).findDescendantsByProvider(NOWHERE)).toEqual([])
    })

    it("ignores an inherited binding — the question is who declared it", () => {
        // a1 resolves SHARED through the chain but declares nothing.
        expect(tree.a1.container.isRegistered(SHARED)).toBe(true)
        expect(tree.a1.container.isRegistered(SHARED, "self")).toBe(false)
        expect(registryOf(tree.a).findDescendantsByProvider(SHARED)).toEqual([])
    })

    it("returns Containers", () => {
        const ancestor = registryOf(tree.a1).findAncestorByProvider(ROOT_ONLY)
        const descendants = registryOf(tree.root).findDescendantsByProvider(DEEP)

        expect(ancestor).toBeInstanceOf(Container)
        for (const container of descendants) expect(container).toBeInstanceOf(Container)
    })
})

describe("ModuleRegistry — attach and detach", () => {
    it("attaches to the parent and detaches again", () => {
        const parent = makeApp({ id: "p" })
        const child = makeChild(parent, { id: "c" })
        const registry = registryOf(child)

        expect(registryOf(parent).children()).toEqual([])

        registry.attach()
        expect(registryOf(parent).children()).toEqual([child.container])

        registry.detach()
        expect(registryOf(parent).children()).toEqual([])
    })

    it("is a no-op at an App root", () => {
        const root = makeApp({ id: "solo" })

        expect(() => registryOf(root).attach()).not.toThrow()
        expect(() => registryOf(root).detach()).not.toThrow()
        expect(registryOf(root).children()).toEqual([])
    })
})
