import { act, render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it } from "vitest"

import { Container, type DependencyContainer } from "../../src/aliases/index.js"
import { ModuleProvider } from "../../src/react/providers/ModuleProvider"
import { useModuleContext } from "../../src/react/hooks/useModuleContext"

let rebuildModule: (() => void) | null = null
let lastContainer: DependencyContainer | null = null
let prevContainer: DependencyContainer | null = null

function ModuleProbe({ testId }: { testId: string }) {
    const { rebuild, id, container } = useModuleContext()
    rebuildModule = rebuild
    prevContainer = lastContainer
    lastContainer = container

    return (
        <div>
            <span data-testid={`${testId}-id`}>{id}</span>
            <span data-testid={`${testId}-same-container`}>
                {prevContainer && prevContainer === container ? "same" : "different"}
            </span>
        </div>
    )
}

describe("rebuild contracts", () => {
    it("keeps inherited container identity on rebuild", () => {
        const inherited = Container.createChildContainer()
        rebuildModule = null
        lastContainer = null
        prevContainer = null

        render(
            <ModuleProvider container={inherited}>
                <ModuleProbe testId="inherit" />
            </ModuleProvider>
        )

        expect(screen.getByTestId("inherit-id").textContent).toBe("0")
        expect(screen.getByTestId("inherit-same-container").textContent).toBe("different")

        act(() => {
            rebuildModule?.()
        })

        expect(screen.getByTestId("inherit-id").textContent).toBe("1")
        expect(screen.getByTestId("inherit-same-container").textContent).toBe("same")
    })

    it("creates new container on root rebuild", () => {
        rebuildModule = null
        lastContainer = null
        prevContainer = null

        render(
            <ModuleProvider root>
                <ModuleProbe testId="root" />
            </ModuleProvider>
        )

        expect(screen.getByTestId("root-id").textContent).toBe("0")

        act(() => {
            rebuildModule?.()
        })

        expect(screen.getByTestId("root-id").textContent).toBe("1")
        expect(screen.getByTestId("root-same-container").textContent).toBe("different")
    })

    it("creates new container on factory rebuild", () => {
        rebuildModule = null
        lastContainer = null
        prevContainer = null

        render(
            <ModuleProvider factory={() => Container.createChildContainer()}>
                <ModuleProbe testId="factory" />
            </ModuleProvider>
        )

        expect(screen.getByTestId("factory-id").textContent).toBe("0")

        act(() => {
            rebuildModule?.()
        })

        expect(screen.getByTestId("factory-id").textContent).toBe("1")
        expect(screen.getByTestId("factory-same-container").textContent).toBe("different")
    })

    it("throws on failed rebuild and unmounts current module tree", () => {
        let shouldFail = false

        function Probe() {
            const { rebuild, id } = useModuleContext()
            rebuildModule = rebuild
            return <span data-testid="id">{id}</span>
        }

        render(
            <ModuleProvider
                root
                onModuleInit={() => {
                    if (shouldFail) {
                        throw new Error("rebuild init failed")
                    }
                }}
            >
                <Probe />
            </ModuleProvider>
        )

        expect(screen.getByTestId("id").textContent).toBe("0")

        shouldFail = true

        expect(() =>
            act(() => {
                rebuildModule?.()
            })
        ).toThrowError("rebuild init failed")

        expect(screen.queryByTestId("id")).toBeNull()
    })

    it("works under React.StrictMode without runtime errors", () => {
        function Probe() {
            const { id } = useModuleContext()
            return <span data-testid="strict-id">{id}</span>
        }

        render(
            <React.StrictMode>
                <ModuleProvider root>
                    <Probe />
                </ModuleProvider>
            </React.StrictMode>
        )

        expect(screen.getByTestId("strict-id").textContent).toBe("0")
    })
})
