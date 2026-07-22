import { act, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import React from "react"

import { Container } from "../../src/aliases/index.js"
import { ModuleProvider } from "../../src/react/providers/ModuleProvider"
import { useModuleContext } from "../../src/react/hooks/useModuleContext"
import { useResolve, useTryResolve } from "../../src/react/hooks/useResolve"

class VersionedService {
    static nextVersion = 0
    readonly version = ++VersionedService.nextVersion
}

const TDynamic = Symbol.for("tests.rebuild.dynamic")

let rebuildRoot: (() => void) | null = null
let rebuildChild: (() => void) | null = null
let setDynamicProviders: ((value: boolean) => void) | null = null
let factoryCalls = 0

function RootControls() {
    const { rebuild } = useModuleContext()
    rebuildRoot = rebuild
    return null
}

function ChildControls() {
    const { rebuild } = useModuleContext()
    rebuildChild = rebuild
    return null
}

function VersionProbe({ testId }: { testId: string }) {
    const service = useResolve(VersionedService)
    const { id } = useModuleContext()

    return (
        <div>
            <span data-testid={`${testId}-version`}>{service.version}</span>
            <span data-testid={`${testId}-id`}>{id}</span>
        </div>
    )
}

function DynamicProbe({ testId }: { testId: string }) {
    const value = useTryResolve<string>(TDynamic)
    return <span data-testid={testId}>{value ?? "missing"}</span>
}

describe("module rebuild advanced", () => {
    beforeEach(() => {
        VersionedService.nextVersion = 0
        rebuildRoot = null
        rebuildChild = null
        setDynamicProviders = null
        factoryCalls = 0
    })

    it("tears down the previous module on rebuild", async () => {
        const unmountCalls: number[] = []
        let initVersion = 0

        function Probe() {
            const { rebuild, id } = useModuleContext()
            rebuildRoot = rebuild
            return <span data-testid="id">{id}</span>
        }

        render(
            <ModuleProvider
                root
                onModuleInit={() => {
                    initVersion += 1
                }}
                onModuleUnmount={() => {
                    unmountCalls.push(initVersion)
                }}
            >
                <Probe />
            </ModuleProvider>
        )

        // The rebuild updater is pure — teardown of the old resolution moves to the effect path
        // (deferred microtask flush) and runs AFTER the new resolution has rendered + inited. So the old
        // module's unmount observes the post-swap init counter (2, not 1). The async act flushes the
        // deferred teardown. The unmount/init counters (unmountCalls) detect the rebuilds.
        await act(async () => {
            rebuildRoot?.()
        })

        expect(unmountCalls).toEqual([2])

        await act(async () => {
            rebuildRoot?.()
        })

        expect(unmountCalls).toEqual([2, 3])
    })

    it("creates a fresh factory container on each rebuild", () => {
        function Probe() {
            const value = useResolve<string>(TDynamic)
            const { rebuild, id } = useModuleContext()
            rebuildRoot = rebuild
            return (
                <div>
                    <span data-testid="value">{value}</span>
                    <span data-testid="id">{id}</span>
                </div>
            )
        }

        render(
            <ModuleProvider
                factory={() => {
                    factoryCalls += 1
                    const c = Container.createChildContainer()
                    c.register(TDynamic, { useValue: `factory-${factoryCalls}` })
                    return c
                }}
            >
                <Probe />
            </ModuleProvider>
        )

        expect(screen.getByTestId("value").textContent).toBe("factory-1")

        act(() => {
            rebuildRoot?.()
        })

        // The fresh factory value (factory-1 → factory-2) detects the rebuild.
        expect(screen.getByTestId("value").textContent).toBe("factory-2")
    })

    it("exposes newly added parent provider to descendants only after explicit parent rebuild", () => {
        function Harness() {
            const [enabled, setEnabled] = React.useState(false)
            setDynamicProviders = setEnabled

            return (
                <ModuleProvider root providers={enabled ? [{ provide: TDynamic, useValue: "enabled" }] : []}>
                    <RootControls />
                    <ModuleProvider>
                        <DynamicProbe testId="desc-value" />
                    </ModuleProvider>
                </ModuleProvider>
            )
        }

        render(<Harness />)
        expect(screen.getByTestId("desc-value").textContent).toBe("missing")

        act(() => {
            setDynamicProviders?.(true)
        })

        expect(screen.getByTestId("desc-value").textContent).toBe("missing")

        act(() => {
            rebuildRoot?.()
        })

        expect(screen.getByTestId("desc-value").textContent).toBe("enabled")
    })

    it("coalesces child rebuild when parent rebuild is triggered multiple times in one cycle", () => {
        render(
            <ModuleProvider root providers={[VersionedService]}>
                <RootControls />
                <VersionProbe testId="root" />
                <ModuleProvider>
                    <ChildControls />
                    <VersionProbe testId="child" />
                </ModuleProvider>
            </ModuleProvider>
        )

        // The single version bump (1→2, not 1→3) proves the two parent rebuild calls coalesced into one,
        // and that the cascade reached the child.
        expect(screen.getByTestId("root-version").textContent).toBe("1")
        expect(screen.getByTestId("child-version").textContent).toBe("1")

        act(() => {
            rebuildRoot?.()
            rebuildRoot?.()
        })

        expect(screen.getByTestId("root-version").textContent).toBe("2")
        expect(screen.getByTestId("child-version").textContent).toBe("2")
    })

    it("keeps child manual rebuild independent after parent rebuild", () => {
        // The child owns its own VersionedService so its rebuilds (parent-cascaded and manual alike) are
        // observable via a fresh instance — a service version is the detector, not the module id.
        render(
            <ModuleProvider root providers={[VersionedService]}>
                <RootControls />
                <ModuleProvider providers={[VersionedService]}>
                    <ChildControls />
                    <VersionProbe testId="child" />
                </ModuleProvider>
            </ModuleProvider>
        )

        const versionInitial = screen.getByTestId("child-version").textContent

        act(() => {
            rebuildRoot?.()
        })
        const versionAfterParent = screen.getByTestId("child-version").textContent
        expect(versionAfterParent).not.toBe(versionInitial) // parent rebuild cascaded to the child

        act(() => {
            rebuildChild?.()
        })
        const versionAfterChild = screen.getByTestId("child-version").textContent
        expect(versionAfterChild).not.toBe(versionAfterParent) // independent manual child rebuild
    })
})
