import { describe, expect, it, vi } from "vitest"
import type { ProviderLifecycle } from "../../src/core/providers/module-lifecycle/module-lifecycle.types.js"
import { createModuleResolution } from "../../src/core/module/resolution.js"
import { ModuleLifecycle } from "../../src/core/providers/module-lifecycle/module-lifecycle.provider.js"

describe("module lifecycle multi-token support", () => {
    it("uses resolveAll once per repeated token and maps instances by occurrence index", () => {
        const calls: string[] = []
        const TOKEN_A = Symbol("TOKEN_A")
        const TOKEN_B = Symbol("TOKEN_B")

        const a1: ProviderLifecycle = { onModuleInit: () => calls.push("a1") }
        const b1: ProviderLifecycle = { onModuleInit: () => calls.push("b1") }
        const a2: ProviderLifecycle = { onModuleInit: () => calls.push("a2") }

        const providers = [
            { provide: TOKEN_A, useValue: a1 },
            { provide: TOKEN_B, useValue: b1 },
            { provide: TOKEN_A, useValue: a2 },
        ]

        const resolution = createModuleResolution(null, { root: true, providers })
        const resolveAllSpy = vi.spyOn(resolution.container, "resolveAll")
        const resolveSpy = vi.spyOn(resolution.container, "resolve")

        resolution.container.resolve(ModuleLifecycle).init()

        expect(calls).toEqual(["a1", "b1", "a2"])
        expect(resolveAllSpy).toHaveBeenCalledTimes(1)
        expect(resolveAllSpy).toHaveBeenCalledWith(TOKEN_A)

        const directResolveCallsForTokenA = resolveSpy.mock.calls.filter((args) => args[0] === TOKEN_A)
        expect(directResolveCallsForTokenA).toHaveLength(0)
    })
})
