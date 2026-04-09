import { act, render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ModuleProvider } from "../../src/module/ModuleProvider.js"
import { useModuleContext } from "../../src/module/useModuleContext.js"
import { useResolve } from "../../src/resolver/useResolve.js"

class HeavyService {
    // Large payload to make leaks visible in heap trends.
    readonly payload = Array.from({ length: 20_000 }, (_, i) => i)
}

class HeavyServiceA {
    readonly payload = Array.from({ length: 30_000 }, (_, i) => i)
}

class HeavyServiceB {
    constructor(readonly serviceA: HeavyServiceA) {}
}

function forceGC(): void {
    const gc = ((globalThis as any).gc ?? (global as any).gc) as (() => void) | undefined
    if (!gc) return
    for (let i = 0; i < 5; i += 1) {
        gc()
    }
}

function heapUsedMB(): number {
    return process.memoryUsage().heapUsed / (1024 * 1024)
}

async function flushAsyncCleanup(): Promise<void> {
    await new Promise<void>((resolve) => {
        setTimeout(resolve, 0)
    })
    await Promise.resolve()
}

function HeavyProbe() {
    const service = useResolve(HeavyService)
    return <span>{service.payload.length}</span>
}

function HeavyNestedProbe() {
    const serviceB = useResolve(HeavyServiceB)
    return <span>{serviceB.serviceA.payload.length}</span>
}

let rebuildModule: (() => void) | null = null

function RebuildControls() {
    const { rebuild } = useModuleContext()
    rebuildModule = rebuild
    return null
}

const hasGC = Boolean((globalThis as any).gc ?? (global as any).gc)
const describeWithGC = hasGC ? describe : describe.skip

describeWithGC("memory leak guards", () => {
    it("does not show sustained heap growth over repeated mount/unmount cycles", async () => {
        for (let i = 0; i < 30; i += 1) {
            const view = render(
                <ModuleProvider root providers={[HeavyService]}>
                    <HeavyProbe />
                </ModuleProvider>
            )
            view.unmount()
            await flushAsyncCleanup()
        }

        forceGC()
        const baseline = heapUsedMB()

        for (let i = 0; i < 220; i += 1) {
            const view = render(
                <ModuleProvider root providers={[HeavyService]}>
                    <HeavyProbe />
                </ModuleProvider>
            )
            view.unmount()
            await flushAsyncCleanup()
        }

        forceGC()
        const after = heapUsedMB()
        const growthMB = after - baseline

        // Keep threshold generous to avoid machine-specific noise while still catching leaks.
        expect(growthMB).toBeLessThan(20)
    }, 120000)

    it("does not accumulate heap under frequent rebuilds", async () => {
        rebuildModule = null

        const view = render(
            <ModuleProvider root providers={[HeavyService]}>
                <RebuildControls />
                <HeavyProbe />
            </ModuleProvider>
        )

        for (let i = 0; i < 20; i += 1) {
            act(() => {
                rebuildModule?.()
            })
            await flushAsyncCleanup()
        }

        forceGC()
        const baseline = heapUsedMB()

        for (let i = 0; i < 260; i += 1) {
            act(() => {
                rebuildModule?.()
            })
            await flushAsyncCleanup()
        }

        view.unmount()
        await flushAsyncCleanup()

        forceGC()
        const after = heapUsedMB()
        const growthMB = after - baseline

        expect(growthMB).toBeLessThan(10)
    }, 120000)

    it("does not leak with nested service graph (ServiceB depends on ServiceA)", async () => {
        for (let i = 0; i < 30; i += 1) {
            const view = render(
                <ModuleProvider
                    root
                    providers={[
                        HeavyServiceA,
                        {
                            provide: HeavyServiceB,
                            useFactory: (_, serviceA: HeavyServiceA) => new HeavyServiceB(serviceA),
                            inject: [HeavyServiceA],
                        },
                    ]}
                >
                    <HeavyNestedProbe />
                </ModuleProvider>
            )
            view.unmount()
            await flushAsyncCleanup()
        }

        forceGC()
        const baseline = heapUsedMB()

        for (let i = 0; i < 220; i += 1) {
            const view = render(
                <ModuleProvider
                    root
                    providers={[
                        HeavyServiceA,
                        {
                            provide: HeavyServiceB,
                            useFactory: (_, serviceA: HeavyServiceA) => new HeavyServiceB(serviceA),
                            inject: [HeavyServiceA],
                        },
                    ]}
                >
                    <HeavyNestedProbe />
                </ModuleProvider>
            )
            view.unmount()
            await flushAsyncCleanup()
        }

        forceGC()
        const after = heapUsedMB()
        const growthMB = after - baseline

        expect(growthMB).toBeLessThan(24)
    }, 120000)
})
