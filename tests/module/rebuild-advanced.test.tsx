import { act, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import React from "react"

import { Container } from "../../src/aliases/index.js"
import { ModuleProvider } from "../../src/module/ModuleProvider.js"
import { useModuleContext } from "../../src/module/useModuleContext.js"
import { useResolve, useTryResolve } from "../../src/resolver/useResolve.js"

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

    it("runs previous module unmount before replacing module on rebuild", () => {
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

        expect(screen.getByTestId("id").textContent).toBe("0")

        act(() => {
            rebuildRoot?.()
        })

        expect(screen.getByTestId("id").textContent).toBe("1")
        expect(unmountCalls).toEqual([1])

        act(() => {
            rebuildRoot?.()
        })

        expect(screen.getByTestId("id").textContent).toBe("2")
        expect(unmountCalls).toEqual([1, 2])
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
        expect(screen.getByTestId("id").textContent).toBe("0")

        act(() => {
            rebuildRoot?.()
        })

        expect(screen.getByTestId("value").textContent).toBe("factory-2")
        expect(screen.getByTestId("id").textContent).toBe("1")
    })

    it("exposes newly added parent provider to descendants only after explicit parent rebuild", () => {
        function Harness() {
            const [enabled, setEnabled] = React.useState(false)
            setDynamicProviders = setEnabled

            return (
                <ModuleProvider
                    root
                    providers={enabled ? [{ provide: TDynamic, useValue: "enabled" }] : []}
                >
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

        expect(screen.getByTestId("root-id").textContent).toBe("0")
        expect(screen.getByTestId("child-id").textContent).toBe("0")

        act(() => {
            rebuildRoot?.()
            rebuildRoot?.()
        })

        expect(screen.getByTestId("root-id").textContent).toBe("1")
        expect(screen.getByTestId("child-id").textContent).toBe("1")
    })

    it("keeps child manual rebuild independent after parent rebuild", () => {
        render(
            <ModuleProvider root providers={[VersionedService]}>
                <RootControls />
                <ModuleProvider>
                    <ChildControls />
                    <VersionProbe testId="child" />
                </ModuleProvider>
            </ModuleProvider>
        )

        expect(screen.getByTestId("child-id").textContent).toBe("0")

        act(() => {
            rebuildRoot?.()
        })
        expect(screen.getByTestId("child-id").textContent).toBe("1")

        act(() => {
            rebuildChild?.()
        })
        expect(screen.getByTestId("child-id").textContent).toBe("2")
    })
})
