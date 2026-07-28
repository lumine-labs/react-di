import { describe, expect, it } from "vitest"

import { Container, Scope } from "../../src/container/index.js"
import type { Provider } from "../../src/container/index.js"
import { App, Module } from "../../src/core/module/module.js"
import { ModuleLifecycle } from "../../src/core/providers/module-lifecycle/module-lifecycle.provider.js"
import { ModuleRegistry } from "../../src/core/providers/module-registry/module-registry.provider.js"
import { Resolver } from "../../src/core/providers/resolver/resolver.provider.js"
import { plain } from "../setup/helpers.js"

// Module.providers — the declared snapshot.
// ========================================
//
// `providers` is a declared snapshot, reduced to `{ token, scope?, lazy?, aliasOf? }` — the shape the
// lifecycle needs to decide what to build eagerly and what to skip. Nothing constructible survives into
// it: no instances, no implementation classes, no factory closures.

const SYSTEM_TOKENS = [Module, Resolver, ModuleRegistry, ModuleLifecycle]

const ALIAS_TARGET = Symbol.for("tests.snapshot.alias-target")
const ALIAS = Symbol.for("tests.snapshot.alias")
const VALUE = Symbol.for("tests.snapshot.value")
const FACTORY = Symbol.for("tests.snapshot.factory")

/** The snapshot minus the four providers every module registers for itself. */
function userSnapshot(module: Module) {
    return module.providers.slice(SYSTEM_TOKENS.length)
}

describe("system providers", () => {
    it("opens with the four system providers, token-only", () => {
        const snapshot = new App().providers

        expect(snapshot.slice(0, 4).map((entry) => entry.token)).toEqual(SYSTEM_TOKENS)
        expect(snapshot.slice(0, 4).map((entry) => Object.keys(entry))).toEqual([
            ["token"],
            ["token"],
            ["token"],
            ["token"],
        ])
    })
})

describe("user providers", () => {
    it("records a constructor-shorthand provider as its own token and nothing else", () => {
        const Service = plain("shorthand")
        const module = new App({ providers: [Service] })

        expect(userSnapshot(module)).toEqual([{ token: Service }])
    })

    it("reduces every provider form to token, scope, lazy and aliasOf", () => {
        const Impl = plain("impl")
        const module = new App({
            providers: [
                { provide: ALIAS_TARGET, useClass: Impl as never, scope: Scope.Transient },
                { provide: ALIAS, useExisting: ALIAS_TARGET },
                { provide: VALUE, useValue: { deep: true } },
                { provide: FACTORY, useFactory: () => 1, lazy: true },
            ],
        })

        expect(userSnapshot(module)).toEqual([
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

        const module = new App({
            providers: [
                { provide: ALIAS_TARGET, useClass: Impl as never },
                { provide: VALUE, useValue: instance },
                { provide: FACTORY, useFactory: factory, inject: [VALUE] },
            ],
        })

        const forbidden = ["provide", "useClass", "useValue", "useFactory", "useExisting", "inject"]
        for (const entry of userSnapshot(module)) {
            expect(Object.keys(entry).filter((key) => forbidden.includes(key))).toEqual([])
        }

        const values = userSnapshot(module).flatMap((entry) => Object.values(entry))
        expect(values).not.toContain(instance)
        expect(values).not.toContain(factory)
        expect(values).not.toContain(Impl)
    })

    it("leaves `scope` off entirely when it is explicitly undefined", () => {
        const Impl = plain("impl")
        const module = new App({
            providers: [{ provide: ALIAS_TARGET, useClass: Impl as never, scope: undefined }],
        })

        const [entry] = userSnapshot(module)

        expect(Object.keys(entry)).toEqual(["token"])
        expect("scope" in entry).toBe(false)
        expect(entry).toStrictEqual({ token: ALIAS_TARGET })
    })

    it("records an explicit singleton scope, and omits it when the provider is silent", () => {
        const Impl = plain("impl")
        const module = new App({
            providers: [
                { provide: ALIAS_TARGET, useClass: Impl as never, scope: Scope.Singleton },
                { provide: VALUE, useClass: Impl as never },
            ],
        })

        expect(userSnapshot(module)).toEqual([{ token: ALIAS_TARGET, scope: "singleton" }, { token: VALUE }])
    })

    it("records `lazy` only when it is true", () => {
        const module = new App({
            providers: [
                { provide: ALIAS_TARGET, useFactory: () => 1, lazy: true },
                { provide: VALUE, useFactory: () => 2, lazy: false },
                { provide: FACTORY, useFactory: () => 3 },
            ],
        })

        expect(userSnapshot(module)).toEqual([
            { token: ALIAS_TARGET, lazy: true },
            { token: VALUE },
            { token: FACTORY },
        ])
    })

    it("is a copy — mutating the source provider afterwards does not reach it", () => {
        const source = { provide: VALUE, useValue: 1, scope: Scope.Transient } as Provider
        const module = new App({ providers: [source] })

        Object.assign(source, { scope: Scope.Singleton, lazy: true })

        expect(userSnapshot(module)).toEqual([{ token: VALUE, scope: "transient" }])
    })

    it("does not depend on a container being passed in — a Module owns its own", () => {
        const module = new App({ providers: [{ provide: VALUE, useValue: 1 }] })

        expect(module.container).toBeInstanceOf(Container)
        expect(module.container.resolve(VALUE)).toBe(1)
    })
})
