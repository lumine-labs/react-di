import { beforeEach, describe, expect, it } from "vitest"

import { Container } from "../../src/container/index.js"
import { createModuleResolution } from "../../src/core/module/resolution.js"
import { ModuleLifecycle } from "../../src/core/providers/module-lifecycle/module-lifecycle.provider.js"
import { ModuleRegistry } from "../../src/core/providers/module-registry/module-registry.provider.js"

// ModuleRegistry traversal
// ========================================
//
//   root ──┬── a ──┬── a1
//          │       └── a2
//          └── b
//
// Every traversal method deals in `Container` — ids and tokens are lookup keys, never return values.
// The tree is built from `metadata.parent`, which is the context parent, and a node only becomes visible
// to its parent once it has mounted.

const SHARED = Symbol.for("tests.registry.shared")
const ROOT_ONLY = Symbol.for("tests.registry.root-only")
const DEEP = Symbol.for("tests.registry.deep")
const NOWHERE = Symbol.for("tests.registry.nowhere")

type Tree = {
    root: Container
    a: Container
    a1: Container
    a2: Container
    b: Container
}

let tree: Tree

function registryOf(container: Container): ModuleRegistry {
    return container.resolve(ModuleRegistry)
}

function mount(container: Container): void {
    container.resolve(ModuleLifecycle).mount()
}

beforeEach(() => {
    const root = createModuleResolution(null, {
        root: true,
        id: "root",
        providers: [
            { provide: SHARED, useValue: "root" },
            { provide: ROOT_ONLY, useValue: "root-only" },
        ],
    })
    const a = createModuleResolution(root.container, { id: "a", providers: [{ provide: SHARED, useValue: "a" }] })
    const a1 = createModuleResolution(a.container, { id: "a1" })
    const a2 = createModuleResolution(a.container, { id: "a2", providers: [{ provide: DEEP, useValue: "a2" }] })
    const b = createModuleResolution(root.container, { id: "b", providers: [{ provide: DEEP, useValue: "b" }] })

    // React mounts depth-first: leaves commit before their parents, siblings in render order.
    for (const module of [a1, a2, a, b, root]) mount(module.container)

    tree = { root: root.container, a: a.container, a1: a1.container, a2: a2.container, b: b.container }
})

describe("ModuleRegistry — parent", () => {
    it("returns the parent container", () => {
        expect(registryOf(tree.a1).parent()).toBe(tree.a)
        expect(registryOf(tree.a).parent()).toBe(tree.root)
        expect(registryOf(tree.a1).parent()).toBeInstanceOf(Container)
    })

    it("returns null at a root", () => {
        expect(registryOf(tree.root).parent()).toBeNull()
    })

    it("returns null when the context parent is not a module", () => {
        const bare = new Container()
        const module = createModuleResolution(bare, { id: "orphan" })

        expect(registryOf(module.container).parent()).toBeNull()
    })
})

describe("ModuleRegistry — ancestors", () => {
    it("lists ancestors nearest first, excluding self", () => {
        expect(registryOf(tree.a1).ancestors()).toEqual([tree.a, tree.root])
        expect(registryOf(tree.a).ancestors()).toEqual([tree.root])
    })

    it("is empty at a root", () => {
        expect(registryOf(tree.root).ancestors()).toEqual([])
    })

    it("stops at the first non-module container", () => {
        const bare = new Container()
        const module = createModuleResolution(bare, { id: "orphan" })

        expect(registryOf(module.container).ancestors()).toEqual([])
    })

    it("does not depend on mounting — the chain is metadata, not attachment", () => {
        const root = createModuleResolution(null, { root: true, id: "unmounted-root" })
        const child = createModuleResolution(root.container, { id: "unmounted-child" })

        expect(registryOf(child.container).ancestors()).toEqual([root.container])
    })
})

describe("ModuleRegistry — findRoot", () => {
    it("returns the outermost module of the tree", () => {
        expect(registryOf(tree.a1).findRoot()).toBe(tree.root)
        expect(registryOf(tree.b).findRoot()).toBe(tree.root)
    })

    it("returns its own container when it is already the root", () => {
        expect(registryOf(tree.root).findRoot()).toBe(tree.root)
    })

    it("returns its own container when nothing above it is a module", () => {
        const module = createModuleResolution(new Container(), { id: "orphan" })

        expect(registryOf(module.container).findRoot()).toBe(module.container)
    })
})

describe("ModuleRegistry — children", () => {
    it("lists direct children only, in attach order", () => {
        expect(registryOf(tree.root).children()).toEqual([tree.a, tree.b])
        expect(registryOf(tree.a).children()).toEqual([tree.a1, tree.a2])
    })

    it("is empty for a leaf", () => {
        expect(registryOf(tree.a1).children()).toEqual([])
    })

    it("only sees children that have mounted", () => {
        const late = createModuleResolution(tree.root, { id: "late" })

        expect(registryOf(tree.root).children()).toEqual([tree.a, tree.b])

        mount(late.container)
        expect(registryOf(tree.root).children()).toEqual([tree.a, tree.b, late.container])
    })

    it("returns Containers", () => {
        for (const child of registryOf(tree.root).children()) {
            expect(child).toBeInstanceOf(Container)
        }
    })
})

describe("ModuleRegistry — descendants", () => {
    it("walks depth-first, excluding self", () => {
        expect(registryOf(tree.root).descendants()).toEqual([tree.a, tree.a1, tree.a2, tree.b])
    })

    it("is scoped to the subtree it is asked from", () => {
        expect(registryOf(tree.a).descendants()).toEqual([tree.a1, tree.a2])
        expect(registryOf(tree.b).descendants()).toEqual([])
    })

    it("only sees mounted nodes", async () => {
        createModuleResolution(tree.b, { id: "unmounted" })
        expect(registryOf(tree.root).descendants()).toEqual([tree.a, tree.a1, tree.a2, tree.b])

        await tree.a2.resolve(ModuleLifecycle).destroy()
        expect(registryOf(tree.root).descendants()).toEqual([tree.a, tree.a1, tree.b])
    })

    it("returns Containers", () => {
        for (const descendant of registryOf(tree.root).descendants()) {
            expect(descendant).toBeInstanceOf(Container)
        }
    })
})

describe("ModuleRegistry — lookup by id", () => {
    it("finds an ancestor by id", () => {
        expect(registryOf(tree.a1).findAncestorById("a")).toBe(tree.a)
        expect(registryOf(tree.a1).findAncestorById("root")).toBe(tree.root)
    })

    it("returns null for an id that is not an ancestor", () => {
        expect(registryOf(tree.a1).findAncestorById("b")).toBeNull()
        expect(registryOf(tree.a1).findAncestorById("a1")).toBeNull()
        expect(registryOf(tree.a1).findAncestorById("missing")).toBeNull()
    })

    it("finds a descendant by id", () => {
        expect(registryOf(tree.root).findDescendantById("a2")).toBe(tree.a2)
        expect(registryOf(tree.root).findDescendantById("b")).toBe(tree.b)
    })

    it("returns null for an id that is not a descendant", () => {
        expect(registryOf(tree.root).findDescendantById("root")).toBeNull()
        expect(registryOf(tree.a).findDescendantById("b")).toBeNull()
        expect(registryOf(tree.a1).findDescendantById("a")).toBeNull()
    })

    it("returns the nearest match when two ancestors share an id", () => {
        const outer = createModuleResolution(null, { root: true, id: "dup" })
        const middle = createModuleResolution(outer.container, { id: "dup" })
        const leaf = createModuleResolution(middle.container, { id: "leaf" })

        expect(registryOf(leaf.container).findAncestorById("dup")).toBe(middle.container)
    })
})

describe("ModuleRegistry — lookup by provider", () => {
    it("finds the nearest ancestor that registers the token itself", () => {
        // `a` shadows the root's SHARED, and the ancestor search asks each container non-recursively,
        // so the nearest declaring module wins rather than the first one that can merely resolve it.
        expect(registryOf(tree.a1).findAncestorByProvider(SHARED)).toBe(tree.a)
        expect(registryOf(tree.a1).findAncestorByProvider(ROOT_ONLY)).toBe(tree.root)
    })

    it("does not count a token it owns itself", () => {
        expect(registryOf(tree.a).findAncestorByProvider(SHARED)).toBe(tree.root)
    })

    it("returns null when no ancestor declares the token", () => {
        expect(registryOf(tree.a1).findAncestorByProvider(NOWHERE)).toBeNull()
        expect(registryOf(tree.a1).findAncestorByProvider(DEEP)).toBeNull()
        expect(registryOf(tree.root).findAncestorByProvider(SHARED)).toBeNull()
    })

    it("finds every descendant declaring the token, depth-first", () => {
        expect(registryOf(tree.root).findDescendantsByProvider(DEEP)).toEqual([tree.a2, tree.b])
    })

    it("excludes self and reports an empty list when nobody below declares it", () => {
        expect(registryOf(tree.root).findDescendantsByProvider(SHARED)).toEqual([tree.a])
        expect(registryOf(tree.root).findDescendantsByProvider(ROOT_ONLY)).toEqual([])
        expect(registryOf(tree.root).findDescendantsByProvider(NOWHERE)).toEqual([])
    })

    it("ignores an inherited binding — the question is who declared it", () => {
        // a1 resolves SHARED through the chain but declares nothing.
        expect(tree.a1.isRegistered(SHARED)).toBe(true)
        expect(tree.a1.isRegistered(SHARED, false)).toBe(false)
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
        const parent = createModuleResolution(null, { root: true, id: "p" })
        const child = createModuleResolution(parent.container, { id: "c" })
        const registry = registryOf(child.container)

        expect(registryOf(parent.container).children()).toEqual([])

        registry.attach()
        expect(registryOf(parent.container).children()).toEqual([child.container])

        registry.detach()
        expect(registryOf(parent.container).children()).toEqual([])
    })

    it("is a no-op at a root", () => {
        const root = createModuleResolution(null, { root: true, id: "solo" })

        expect(() => registryOf(root.container).attach()).not.toThrow()
        expect(() => registryOf(root.container).detach()).not.toThrow()
        expect(registryOf(root.container).children()).toEqual([])
    })
})
