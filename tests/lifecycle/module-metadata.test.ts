import { describe, expect, it } from "vitest"
import { Container } from "../../src/aliases/index.js"
import { ModuleMetadata } from "../../src/core/providers/module-metadata/module-metadata.provider.js"
import { ModuleLifecycle } from "../../src/core/providers/module-lifecycle/module-lifecycle.provider.js"
import { ModuleRegistry } from "../../src/core/providers/module-registry/module-registry.provider.js"
import { Resolver } from "../../src/core/providers/resolver/resolver.provider.js"
import { createModuleResolution } from "../../src/core/module/resolution.js"

class LocalService {}

describe("ModuleMetadata", () => {
    it("carries id, container and parent as a pure data record", () => {
        const container = Container.createChildContainer()
        const parent = Container.createChildContainer()
        const meta = new ModuleMetadata({ id: "m1", container, parent })

        expect(meta.id).toBe("m1")
        expect(meta.container).toBe(container)
        expect(meta.parent).toBe(parent)
        expect(meta.committed).toBe(false)
        expect(meta.mounted).toBe(false)
        expect(meta.pendingTeardown).toBe(false)
        expect([...meta.children]).toEqual([])
        expect(meta.providers).toEqual([])
    })

    it("exposes children as a set reflecting internal structure mutations", () => {
        const meta = new ModuleMetadata({ id: "m", container: Container.createChildContainer(), parent: null })
        const c1 = Container.createChildContainer()
        const c2 = Container.createChildContainer()

        meta.addChild(c1)
        meta.addChild(c2)
        meta.addChild(c1) // idempotent (Set)

        expect([...meta.children]).toEqual([c1, c2]) // insertion order = commit order
        meta.removeChild(c1)
        expect([...meta.children]).toEqual([c2])
    })

    it("captures the declared provider snapshot (defaults + user, registration order)", () => {
        const resolution = createModuleResolution(null, { root: true, providers: [LocalService] })
        const meta = resolution.container.resolve(ModuleMetadata)

        const tokens = meta.providers.map((provider) =>
            typeof provider === "function" ? provider : provider.provide
        )

        // Resolver first, then the three tree providers, then user providers.
        expect(tokens[0]).toBe(Resolver)
        expect(tokens).toContain(ModuleMetadata)
        expect(tokens).toContain(ModuleRegistry)
        expect(tokens).toContain(ModuleLifecycle)
        expect(tokens.at(-1)).toBe(LocalService)
    })

    it("snapshot is capture-only — dynamic registrations do not appear", () => {
        const resolution = createModuleResolution(null, { root: true })
        const meta = resolution.container.resolve(ModuleMetadata)
        const before = meta.providers.length

        const Dynamic = Symbol("dynamic")
        resolution.container.register(Dynamic, { useValue: 1 })

        expect(meta.providers.length).toBe(before)
        // ...but the container sees it — ask the container, never the list.
        expect(resolution.container.isRegistered(Dynamic)).toBe(true)
    })
})
