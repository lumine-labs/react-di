import { describe, expect, it } from "vitest"
import { Container, type DependencyContainer } from "../../src/aliases/index.js"
import { ModuleMetadata } from "../../src/core/providers/module-metadata/module-metadata.provider.js"
import { ModuleRegistry } from "../../src/core/providers/module-registry/module-registry.provider.js"

// React-free: plain tsyringe child containers each carrying their own ModuleMetadata.

type Node = { container: DependencyContainer; meta: ModuleMetadata; registry: ModuleRegistry }

function makeNode(id: string, parentNode: Node | null): Node {
    const container = parentNode ? parentNode.container.createChildContainer() : Container.createChildContainer()
    const meta = new ModuleMetadata({ id, container, parent: parentNode ? parentNode.container : null })
    container.register(ModuleMetadata, { useValue: meta })
    const registry = new ModuleRegistry(meta)
    return { container, meta, registry }
}

describe("ModuleRegistry", () => {
    it("attach adds own container to the parent's children set (idempotent)", () => {
        const parent = makeNode("p", null)
        const child = makeNode("c", parent)

        child.registry.attach()
        child.registry.attach()

        expect([...parent.meta.children]).toEqual([child.container])
    })

    it("detach removes own container from the parent's children (idempotent, safe if never attached)", () => {
        const parent = makeNode("p", null)
        const child = makeNode("c", parent)

        child.registry.detach() // safe before attach
        child.registry.attach()
        child.registry.detach()
        child.registry.detach() // safe repeat

        expect([...parent.meta.children]).toEqual([])
    })

    it("is a lifecycle root when there is no parent container", () => {
        const root = makeNode("r", null)
        expect(root.registry.parentMetadata()).toBeNull()
        expect(root.registry.findRoot()).toBe(root.meta)
        root.registry.attach() // no-op, no throw
    })

    it("resolves the parent metadata and walks ancestors", () => {
        const a = makeNode("a", null)
        const b = makeNode("b", a)
        const c = makeNode("c", b)

        expect(c.registry.parentMetadata()).toBe(b.meta)
        expect([...c.registry.ancestors()]).toEqual([b.meta, a.meta])
        expect(c.registry.findRoot()).toBe(a.meta)
    })

    it("iterates attached children metadata in insertion order", () => {
        const parent = makeNode("p", null)
        const c1 = makeNode("c1", parent)
        const c2 = makeNode("c2", parent)

        c1.registry.attach()
        c2.registry.attach()

        expect([...parent.registry.childrenMetadata()]).toEqual([c1.meta, c2.meta])
    })

    it("is transparent through an unowned parent to the nearest owned ancestor", () => {
        const owned = makeNode("owned", null)
        // Unowned wrapper: a child container with NO ModuleMetadata registered (inherit-mode module).
        const unownedContainer = owned.container.createChildContainer()
        // A grandchild whose lifecycle parent is the transparent unowned container.
        const grandContainer = unownedContainer.createChildContainer()
        const grandMeta = new ModuleMetadata({ id: "g", container: grandContainer, parent: unownedContainer })
        grandContainer.register(ModuleMetadata, { useValue: grandMeta })
        const grandRegistry = new ModuleRegistry(grandMeta)

        // Resolving ModuleMetadata recursively from the unowned container skips it to the owned ancestor.
        expect(grandRegistry.parentMetadata()).toBe(owned.meta)

        grandRegistry.attach()
        expect([...owned.meta.children]).toEqual([grandContainer])
    })
})
