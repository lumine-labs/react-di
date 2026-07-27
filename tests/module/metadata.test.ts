import { describe, expect, it } from "vitest"

import { Container, Scope } from "../../src/container/index.js"
import type { Provider } from "../../src/container/index.js"
import { createModuleResolution } from "../../src/core/module/resolution.js"
import { ModuleLifecycle } from "../../src/core/providers/module-lifecycle/module-lifecycle.provider.js"
import {
    ModuleMetadata,
    type ModuleMetadataProvider,
} from "../../src/core/providers/module-metadata/module-metadata.provider.js"
import { ModuleRegistry } from "../../src/core/providers/module-registry/module-registry.provider.js"
import { Resolver } from "../../src/core/providers/resolver/resolver.provider.js"
import { plain, tracked } from "../setup/helpers.js"

// ModuleMetadata
// ========================================
//
// `providers` is a declared snapshot, reduced to `{ token, scope?, lazy?, aliasOf? }` — the shape the
// lifecycle needs to decide what to build eagerly and what to skip. Nothing constructible survives into
// it: no instances, no implementation classes, no factory closures.

const SYSTEM_TOKENS = [Resolver, ModuleMetadata, ModuleRegistry, ModuleLifecycle]

const ALIAS_TARGET = Symbol.for("tests.metadata.alias-target")
const ALIAS = Symbol.for("tests.metadata.alias")
const VALUE = Symbol.for("tests.metadata.value")
const FACTORY = Symbol.for("tests.metadata.factory")

/** The snapshot minus the four providers every module registers for itself. */
function userSnapshot(container: Container): readonly ModuleMetadataProvider[] {
    return container.resolve(ModuleMetadata).providers.slice(SYSTEM_TOKENS.length)
}

function mount(container: Container): void {
    container.resolve(ModuleLifecycle).mount()
}

describe("ModuleMetadata — identity", () => {
    it("carries the id, its own container and the context parent", () => {
        const parent = createModuleResolution(null, { root: true, id: "parent" })
        const child = createModuleResolution(parent.container, { id: "child" })
        const metadata = child.container.resolve(ModuleMetadata)

        expect(metadata.id).toBe("child")
        expect(metadata.container).toBe(child.container)
        expect(metadata.parent).toBe(parent.container)
    })

    it("starts uncommitted and unmounted", () => {
        const metadata = createModuleResolution(null, { root: true }).container.resolve(ModuleMetadata)

        expect(metadata.committed).toBe(false)
        expect(metadata.mounted).toBe(false)
    })

    it("flips both flags on mount", () => {
        const module = createModuleResolution(null, { root: true })
        mount(module.container)
        const metadata = module.container.resolve(ModuleMetadata)

        expect(metadata.committed).toBe(true)
        expect(metadata.mounted).toBe(true)
    })
})

describe("ModuleMetadata — provider snapshot", () => {
    it("opens with the four system providers, token-only", () => {
        const snapshot = createModuleResolution(null, { root: true }).container.resolve(ModuleMetadata).providers

        expect(snapshot.slice(0, 4).map((entry) => entry.token)).toEqual(SYSTEM_TOKENS)
        expect(snapshot.slice(0, 4).map((entry) => Object.keys(entry))).toEqual([
            ["token"],
            ["token"],
            ["token"],
            ["token"],
        ])
    })

    it("records a constructor-shorthand provider as its own token and nothing else", () => {
        const Service = plain("shorthand")
        const module = createModuleResolution(null, { root: true, providers: [Service] })

        expect(userSnapshot(module.container)).toEqual([{ token: Service }])
    })

    it("reduces every provider form to token, scope, lazy and aliasOf", () => {
        const Impl = plain("impl")
        const module = createModuleResolution(null, {
            root: true,
            providers: [
                { provide: ALIAS_TARGET, useClass: Impl as never, scope: Scope.Transient },
                { provide: ALIAS, useExisting: ALIAS_TARGET },
                { provide: VALUE, useValue: { deep: true } },
                { provide: FACTORY, useFactory: () => 1, lazy: true },
            ],
        })

        expect(userSnapshot(module.container)).toEqual([
            { token: ALIAS_TARGET, scope: "transient" },
            { token: ALIAS, aliasOf: ALIAS_TARGET },
            { token: VALUE },
            { token: FACTORY, lazy: true },
        ])
    })

    it("keeps nothing constructible — no instances, no classes, no closures", () => {
        const Impl = plain("impl")
        const instance = { alive: true }
        const factory = () => 1

        const module = createModuleResolution(null, {
            root: true,
            providers: [
                { provide: ALIAS_TARGET, useClass: Impl as never },
                { provide: VALUE, useValue: instance },
                { provide: FACTORY, useFactory: factory, inject: [VALUE] },
            ],
        })

        const forbidden = ["provide", "useClass", "useValue", "useFactory", "useExisting", "inject"]
        for (const entry of userSnapshot(module.container)) {
            expect(Object.keys(entry).filter((key) => forbidden.includes(key))).toEqual([])
        }

        const values = userSnapshot(module.container).flatMap((entry) => Object.values(entry))
        expect(values).not.toContain(instance)
        expect(values).not.toContain(factory)
        expect(values).not.toContain(Impl)
    })

    it("leaves `scope` off entirely when it is explicitly undefined", () => {
        const Impl = plain("impl")
        const module = createModuleResolution(null, {
            root: true,
            providers: [{ provide: ALIAS_TARGET, useClass: Impl as never, scope: undefined }],
        })

        const [entry] = userSnapshot(module.container)

        expect(Object.keys(entry)).toEqual(["token"])
        expect("scope" in entry).toBe(false)
        expect(entry).toStrictEqual({ token: ALIAS_TARGET })
    })

    it("records an explicit singleton scope, and omits it when the provider is silent", () => {
        const Impl = plain("impl")
        const module = createModuleResolution(null, {
            root: true,
            providers: [
                { provide: ALIAS_TARGET, useClass: Impl as never, scope: Scope.Singleton },
                { provide: VALUE, useClass: Impl as never },
            ],
        })

        expect(userSnapshot(module.container)).toEqual([{ token: ALIAS_TARGET, scope: "singleton" }, { token: VALUE }])
    })

    it("records `lazy` only when it is true", () => {
        const module = createModuleResolution(null, {
            root: true,
            providers: [
                { provide: ALIAS_TARGET, useFactory: () => 1, lazy: true },
                { provide: VALUE, useFactory: () => 2, lazy: false },
                { provide: FACTORY, useFactory: () => 3 },
            ],
        })

        expect(userSnapshot(module.container)).toEqual([
            { token: ALIAS_TARGET, lazy: true },
            { token: VALUE },
            { token: FACTORY },
        ])
    })

    it("is a copy — mutating the source provider afterwards does not reach it", () => {
        const source = { provide: VALUE, useValue: 1, scope: Scope.Transient } as Provider
        const module = createModuleResolution(null, { root: true, providers: [source] })

        Object.assign(source, { scope: Scope.Singleton, lazy: true })

        expect(userSnapshot(module.container)).toEqual([{ token: VALUE, scope: "transient" }])
    })
})

describe("ModuleMetadata — children", () => {
    it("is empty until a child mounts", () => {
        const parent = createModuleResolution(null, { root: true })
        const child = createModuleResolution(parent.container, {})
        const metadata = parent.container.resolve(ModuleMetadata)

        expect([...metadata.children]).toEqual([])

        mount(child.container)
        expect([...metadata.children]).toEqual([child.container])
    })

    it("collects direct children in attach order", () => {
        const parent = createModuleResolution(null, { root: true })
        const first = createModuleResolution(parent.container, { id: "first" })
        const second = createModuleResolution(parent.container, { id: "second" })
        const third = createModuleResolution(parent.container, { id: "third" })

        // Attach order is mount order, which in React is the order children commit.
        mount(second.container)
        mount(third.container)
        mount(first.container)
        mount(parent.container)

        expect([...parent.container.resolve(ModuleMetadata).children]).toEqual([
            second.container,
            third.container,
            first.container,
        ])
    })

    it("holds direct children only — a grandchild belongs to its own parent", () => {
        const root = createModuleResolution(null, { root: true })
        const child = createModuleResolution(root.container, {})
        const grandchild = createModuleResolution(child.container, {})

        mount(grandchild.container)
        mount(child.container)
        mount(root.container)

        expect([...root.container.resolve(ModuleMetadata).children]).toEqual([child.container])
        expect([...child.container.resolve(ModuleMetadata).children]).toEqual([grandchild.container])
    })

    it("does not adopt a nested root module — a root heads its own tree", () => {
        const outer = createModuleResolution(null, { root: true, id: "outer" })
        const inner = createModuleResolution(outer.container, { root: true, id: "inner" })

        mount(outer.container)
        mount(inner.container)

        expect([...outer.container.resolve(ModuleMetadata).children]).toEqual([])
    })

    it("drops a child again when that child is destroyed", async () => {
        const parent = createModuleResolution(null, { root: true })
        const child = createModuleResolution(parent.container, {})
        const metadata = parent.container.resolve(ModuleMetadata)

        mount(child.container)
        mount(parent.container)
        expect([...metadata.children]).toEqual([child.container])

        await child.container.resolve(ModuleLifecycle).destroy()
        expect([...metadata.children]).toEqual([])
    })

    it("ignores a duplicate attach", () => {
        const parent = createModuleResolution(null, { root: true })
        const child = createModuleResolution(parent.container, {})
        const metadata = parent.container.resolve(ModuleMetadata)

        child.container.resolve(ModuleRegistry).attach()
        child.container.resolve(ModuleRegistry).attach()

        expect(metadata.children.size).toBe(1)
    })

    it("counts a tracked provider's phases exactly once through a mount", () => {
        const log: string[] = []
        const Service = tracked(log, "S")
        const module = createModuleResolution(null, { root: true, providers: [Service] })

        mount(module.container)
        mount(module.container)

        expect(Service.counts).toEqual({ init: 1, mount: 1, unmount: 0, destroy: 0 })
        expect(log).toEqual(["S:ctor", "S:init", "S:mount"])
    })
})
