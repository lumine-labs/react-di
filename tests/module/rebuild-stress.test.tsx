import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ModuleProvider } from "../../src/react/providers/ModuleProvider"
import { useModuleContext } from "../../src/react/hooks/useModuleContext"
import { useResolve } from "../../src/react/hooks/useResolve"

let rebuildRoot: (() => void) | null = null

// Each module owns its own instance, so a fresh version at a given level proves that level rebuilt.
class VersionedService {
    static nextVersion = 0
    readonly version = ++VersionedService.nextVersion
}

function RootControls() {
    const { rebuild } = useModuleContext()
    rebuildRoot = rebuild
    return null
}

function DeepProbe({ testId }: { testId: string }) {
    const { id } = useModuleContext()
    const service = useResolve(VersionedService)
    return (
        <div>
            <span data-testid={`${testId}-id`}>{id}</span>
            <span data-testid={`${testId}-version`}>{service.version}</span>
        </div>
    )
}

describe("rebuild stress", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        rebuildRoot = null
        VersionedService.nextVersion = 0
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("rebuilds deep module trees consistently", () => {
        render(
            <ModuleProvider root providers={[VersionedService]}>
                <RootControls />
                <DeepProbe testId="d-0" />
                <ModuleProvider providers={[VersionedService]}>
                    <DeepProbe testId="d-1" />
                    <ModuleProvider providers={[VersionedService]}>
                        <DeepProbe testId="d-2" />
                        <ModuleProvider providers={[VersionedService]}>
                            <DeepProbe testId="d-3" />
                            <ModuleProvider providers={[VersionedService]}>
                                <DeepProbe testId="d-4" />
                                <ModuleProvider providers={[VersionedService]}>
                                    <DeepProbe testId="d-5" />
                                </ModuleProvider>
                            </ModuleProvider>
                        </ModuleProvider>
                    </ModuleProvider>
                </ModuleProvider>
            </ModuleProvider>
        )

        const idsBefore = Array.from({ length: 6 }, (_, i) => screen.getByTestId(`d-${i}-id`).textContent)
        const versionsBefore = Array.from({ length: 6 }, (_, i) => screen.getByTestId(`d-${i}-version`).textContent)

        // Every module has its own distinct generated id (no shared rebuild counter).
        idsBefore.forEach((id) => expect(id).toBeTruthy())
        expect(new Set(idsBefore).size).toBe(6)

        act(() => {
            rebuildRoot?.()
        })

        const idsAfter = Array.from({ length: 6 }, (_, i) => screen.getByTestId(`d-${i}-id`).textContent)
        const versionsAfter = Array.from({ length: 6 }, (_, i) => screen.getByTestId(`d-${i}-version`).textContent)

        // A fresh version at every level proves the root rebuild cascaded consistently through the whole
        // tree; each level's generated id is a per-resolution label, so it regenerates on rebuild too.
        expect(new Set(idsAfter).size).toBe(6)
        for (let i = 0; i < 6; i += 1) {
            expect(versionsAfter[i]).not.toBe(versionsBefore[i])
            expect(idsAfter[i]).not.toBe(idsBefore[i])
        }
    })

    it("survives long-run mount/unmount/rebuild cycles without dangling timers", async () => {
        let initCount = 0
        let cleanupCount = 0

        function Harness() {
            return (
                <ModuleProvider
                    root
                    onModuleInit={() => {
                        initCount += 1
                    }}
                    onModuleDestroy={() => {
                        cleanupCount += 1
                    }}
                >
                    <RootControls />
                </ModuleProvider>
            )
        }

        for (let i = 0; i < 120; i += 1) {
            const view = render(<Harness />)

            act(() => {
                rebuildRoot?.()
            })

            view.unmount()
            await vi.runAllTimersAsync()
        }

        expect(initCount).toBe(240)
        expect(cleanupCount).toBe(240)
        expect(vi.getTimerCount()).toBe(0)
    })
})
