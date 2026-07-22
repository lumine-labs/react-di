import { describe, expect, it } from "vitest"
import { teardownRoots } from "../../src/core/providers/module-lifecycle/module-lifecycle.provider.js"

// Pure teardown-roots rule: of the pending nodes, keep those whose parent is NOT also pending.
// Tested on plain objects (no containers, no React).

type Node = { name: string; parent: Node | null }

function node(name: string, parent: Node | null = null): Node {
    return { name, parent }
}

const getParent = (n: Node): Node | null => n.parent

describe("teardownRoots", () => {
    it("a whole pending subtree collapses to its single top node", () => {
        const a = node("a")
        const b = node("b", a)
        const c = node("c", b)

        const pending = new Set([a, b, c])
        expect(teardownRoots(pending, getParent).map((n) => n.name)).toEqual(["a"])
    })

    it("a node whose parent survived is itself a root", () => {
        const a = node("a")
        const b = node("b", a)
        const c = node("c", b)

        // Only the b→c subtree unmounts; a stays alive.
        const pending = new Set([b, c])
        expect(teardownRoots(pending, getParent).map((n) => n.name)).toEqual(["b"])
    })

    it("returns multiple disjoint roots", () => {
        const a = node("a")
        const b = node("b", a)
        const x = node("x")
        const y = node("y", x)

        // Two separate subtrees pending; a and x survive would-be parents (both null) → both roots.
        const pending = new Set([a, b, x, y])
        expect(teardownRoots(pending, getParent).map((n) => n.name).sort()).toEqual(["a", "x"])
    })

    it("treats a null parent as not pending (root)", () => {
        const a = node("a")
        expect(teardownRoots(new Set([a]), getParent)).toEqual([a])
    })

    it("returns nothing for an empty pending set", () => {
        expect(teardownRoots(new Set<Node>(), getParent)).toEqual([])
    })
})
