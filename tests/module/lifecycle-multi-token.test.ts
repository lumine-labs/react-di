import { describe, expect, it, vi } from "vitest"
import type { ModuleLifecycle } from "../../src/core/module/lifecycle.types.js"
import { createModuleResolution } from "../../src/core/module/resolution.js"
import { createModuleResolutionLifecycle } from "../../src/core/module/lifecycle.js"
import { runModuleInitLifecycle } from "../../src/core/module/lifecycle.runners.js"

describe("module lifecycle multi-token support", () => {
    it("uses resolveAll once per repeated token and maps instances by occurrence index", () => {
        const calls: string[] = []
        const TOKEN_A = Symbol("TOKEN_A")
        const TOKEN_B = Symbol("TOKEN_B")

        const a1: ModuleLifecycle = { onModuleInit: () => calls.push("a1") }
        const b1: ModuleLifecycle = { onModuleInit: () => calls.push("b1") }
        const a2: ModuleLifecycle = { onModuleInit: () => calls.push("a2") }

        const providers = [
            { provide: TOKEN_A, useValue: a1 },
            { provide: TOKEN_B, useValue: b1 },
            { provide: TOKEN_A, useValue: a2 },
        ]

        const resolution = createModuleResolution(null, { root: true, providers })
        const resolveAllSpy = vi.spyOn(resolution.container, "resolveAll")
        const resolveSpy = vi.spyOn(resolution.container, "resolve")

        const lifecycle = createModuleResolutionLifecycle(resolution, { root: true, providers })
        runModuleInitLifecycle(resolution, lifecycle)

        expect(calls).toEqual(["a1", "b1", "a2"])
        expect(resolveAllSpy).toHaveBeenCalledTimes(1)
        expect(resolveAllSpy).toHaveBeenCalledWith(TOKEN_A)

        const directResolveCallsForTokenA = resolveSpy.mock.calls.filter((args) => args[0] === TOKEN_A)
        expect(directResolveCallsForTokenA).toHaveLength(0)
    })
})
