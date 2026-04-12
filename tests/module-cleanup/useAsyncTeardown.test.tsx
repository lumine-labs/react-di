import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ModuleProvider } from "../../src/module/ModuleProvider.js"
import { AsyncTeardown } from "../../src/module-cleanup/async-teardown.js"
import { useAsyncTeardown } from "../../src/module-cleanup/useAsyncTeardown.js"
import { useResolve } from "../../src/resolver/useResolve.js"

describe("useAsyncTeardown", () => {
    it("returns off() to unsubscribe cleanup before teardown.run()", async () => {
        const cleanup = vi.fn()
        let off!: () => void
        let teardown!: AsyncTeardown

        function Child() {
            teardown = useResolve(AsyncTeardown)
            off = useAsyncTeardown(cleanup, 10)
            return null
        }

        render(
            <ModuleProvider root providers={[AsyncTeardown]}>
                <Child />
            </ModuleProvider>
        )

        off()
        await teardown.run()

        expect(cleanup).not.toHaveBeenCalled()
    })

    it("runs by numeric priority", async () => {
        const calls: string[] = []
        let teardown!: AsyncTeardown

        function Child() {
            teardown = useResolve(AsyncTeardown)
            useAsyncTeardown(() => {
                calls.push("p1")
            }, 1)
            useAsyncTeardown(() => {
                calls.push("p10")
            }, 10)
            return null
        }

        render(
            <ModuleProvider root providers={[AsyncTeardown]}>
                <Child />
            </ModuleProvider>
        )

        await teardown.run()
        expect(calls).toEqual(["p10", "p1"])
    })
})
