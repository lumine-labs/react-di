import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ModuleProvider } from "../../src/module/ModuleProvider.js"
import { useModuleContext } from "../../src/module/useModuleContext.js"

let rebuildRoot: (() => void) | null = null

function RootControls() {
    const { rebuild } = useModuleContext()
    rebuildRoot = rebuild
    return null
}

function IdProbe({ testId }: { testId: string }) {
    const { id } = useModuleContext()
    return <span data-testid={testId}>{id}</span>
}

describe("rebuild stress", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        rebuildRoot = null
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("rebuilds deep module trees consistently", () => {
        render(
            <ModuleProvider root>
                <RootControls />
                <IdProbe testId="id-0" />
                <ModuleProvider>
                    <IdProbe testId="id-1" />
                    <ModuleProvider>
                        <IdProbe testId="id-2" />
                        <ModuleProvider>
                            <IdProbe testId="id-3" />
                            <ModuleProvider>
                                <IdProbe testId="id-4" />
                                <ModuleProvider>
                                    <IdProbe testId="id-5" />
                                </ModuleProvider>
                            </ModuleProvider>
                        </ModuleProvider>
                    </ModuleProvider>
                </ModuleProvider>
            </ModuleProvider>
        )

        for (let i = 0; i <= 5; i += 1) {
            expect(screen.getByTestId(`id-${i}`).textContent).toBe("0")
        }

        act(() => {
            rebuildRoot?.()
        })

        for (let i = 0; i <= 5; i += 1) {
            expect(screen.getByTestId(`id-${i}`).textContent).toBe("1")
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
                        return () => {
                            cleanupCount += 1
                        }
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
