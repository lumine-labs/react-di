import { describe, expect, it } from "vitest"

import { Container, Scope } from "../../src/container/index.js"
import type { Constructor, Provider } from "../../src/container/index.js"
import { App, Module } from "../../src/core/module/module.js"
import { ModuleLifecycle } from "../../src/core/providers/module-lifecycle/module-lifecycle.provider.js"
import { ModuleRegistry } from "../../src/core/providers/module-registry/module-registry.provider.js"
import { Resolver } from "../../src/core/providers/resolver/resolver.provider.js"
import { plain } from "../setup/helpers.js"

// Module.providers — the declared snapshot.
// ========================================
//
// `providers` is a declared snapshot, reduced to `{ token, scope?, lazy?, aliasOf?, multi? }` — the shape
// the lifecycle needs to decide what to build eagerly and what to skip. Nothing constructible survives into
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

    it("normalizes the provide-less useClass shorthand exactly like the provide + useClass form it stands for", () => {
        const Bare = plain("bare") as unknown as Constructor
        const Scoped = plain("scoped") as unknown as Constructor
        const Lazy = plain("lazy") as unknown as Constructor

        const shorthand = new App({
            providers: [
                { useClass: Bare },
                { useClass: Scoped, scope: Scope.Transient },
                { useClass: Lazy, lazy: true },
            ],
        })
        const longhand = new App({
            providers: [
                { provide: Bare, useClass: Bare },
                { provide: Scoped, useClass: Scoped, scope: Scope.Transient },
                { provide: Lazy, useClass: Lazy, lazy: true },
            ],
        })

        expect(userSnapshot(shorthand)).toEqual([
            { token: Bare },
            { token: Scoped, scope: "transient" },
            { token: Lazy, lazy: true },
        ])
        expect(userSnapshot(shorthand)).toEqual(userSnapshot(longhand))
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

    it("keeps one entry per contribution to a collection, each marked multi", () => {
        const First = plain("first") as unknown as Constructor
        const Second = plain("second") as unknown as Constructor
        const module = new App({
            providers: [
                { provide: VALUE, useClass: First, multi: true },
                { provide: VALUE, useClass: Second, multi: true },
                { provide: VALUE, useExisting: ALIAS_TARGET, multi: true },
            ],
        })

        // The token repeats — that repetition IS the collection, and the eager pass groups on it.
        expect(userSnapshot(module)).toEqual([
            { token: VALUE, multi: true },
            { token: VALUE, multi: true },
            { token: VALUE, aliasOf: ALIAS_TARGET, multi: true },
        ])
    })

    it("leaves `multi` off when the provider is silent about it", () => {
        const Impl = plain("impl")
        const module = new App({ providers: [{ provide: ALIAS_TARGET, useClass: Impl as never }] })

        expect(userSnapshot(module)).toEqual([{ token: ALIAS_TARGET }])
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

// The two layers agree because only one of them ever runs on a bad shape
// ========================================
//
// `#setProviders` discriminates with `provider.useClass !== undefined`; the container discriminates with
// `"useClass" in provider`. Those rules disagree on any shape carrying an explicit-undefined key — but the
// disagreement is unreachable, because `Module`'s constructor calls `container.register` BEFORE
// `#setProviders`, and the container rejects every such shape.
//
// That makes the ordering load-bearing rather than incidental: move the snapshot ahead of the
// registration and the module would silently normalize a provider the container would have refused.
// These tests guard the ordering, not the normalization.

describe("registration runs before the snapshot", () => {
    it("rejects an explicit-undefined implementation key at the container, not the module layer", () => {
        // `#setProviders` would read this as a plain class provider under VALUE (`useClass` is undefined,
        // so it falls through to `provide`). The container never lets it get that far.
        expect(() => new App({ providers: [{ provide: VALUE, useClass: undefined } as unknown as Provider] })).toThrow(
            /has no recognised form/
        )
    })

    it("rejects a mixed-key provider at the container, with the container's message", () => {
        const Service = plain("mixed") as unknown as Constructor

        // `#setProviders` would happily normalize this to `{ token: Service }`.
        expect(() =>
            new App({ providers: [{ useClass: Service, useFactory: undefined } as unknown as Provider] })
        ).toThrow(/mixes 2 implementation keys \(useClass, useFactory\)/)
    })

    it("rejects a token-less useValue instead of registering it under `undefined`", () => {
        // Previously this registered under token `undefined` AND joined the lifecycle: `#collectInstances`
        // observed `{ token: undefined }` and fired the hook. Nothing about that was intentional.
        const hook = { onModuleInit: () => calls.push("init") }
        const calls: string[] = []

        expect(() => new App({ providers: [{ useValue: hook } as unknown as Provider] })).toThrow(
            /^Provider with useValue requires `provide`/
        )
        expect(calls).toEqual([])
    })

    it("leaves no partial registration behind when a later provider in the array is bad", () => {
        const good = Symbol.for("tests.snapshot.ordering-good")

        expect(
            () =>
                new App({
                    providers: [
                        { provide: good, useValue: 1 },
                        { useFactory: () => 2 } as unknown as Provider,
                    ],
                })
        ).toThrow(/^Provider with useFactory requires `provide`/)
    })
})
