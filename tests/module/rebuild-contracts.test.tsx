import { act, render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it } from "vitest"

import { Container, type DependencyContainer } from "../../src/aliases/index.js"
import { ModuleProvider } from "../../src/react/providers/ModuleProvider"
import { useContainer, useModuleContext } from "../../src/react/hooks/useModuleContext"
import { ModuleMetadata } from "../../src/core/providers/module-metadata/module-metadata.provider.js"

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
    it("gives an inherit module a generated id when its container is not in an owned chain", () => {
        // A bare external container, NOT a descendant of the owned module's container.
        const bare = Container.createChildContainer()
        let ownerId: string | null = null
        let inheritId: string | null = null

        function OwnerProbe() {
            ownerId = useModuleContext().id
            return null
        }
        function InheritProbe() {
            inheritId = useModuleContext().id
            return null
        }

        render(
            <ModuleProvider root id="feature:owner">
                <OwnerProbe />
                <ModuleProvider container={bare}>
                    <InheritProbe />
                </ModuleProvider>
            </ModuleProvider>
        )

        // Identity follows the container chain, not the React tree: `bare` carries no owned metadata, so
        // the inherit module gets a fresh generated id — NOT the owned ancestor's id.
        expect(inheritId).toBeTruthy()
        expect(inheritId).not.toBe(ownerId)
        expect(inheritId).toMatch(/^@lumelabs\/react-di:/)
    })

    it("shares the owned ancestor's id with an inherit module on that container", () => {
        let ownerId: string | null = null
        let inheritId: string | null = null

        function OwnerProbe() {
            ownerId = useModuleContext().id
            return null
        }
        function InheritProbe() {
            inheritId = useModuleContext().id
            return null
        }
        function Nested() {
            // The owned ancestor's container — an inherit module pointed at it is a window onto it.
            const container = useContainer()
            return (
                <ModuleProvider container={container}>
                    <InheritProbe />
                </ModuleProvider>
            )
        }

        render(
            <ModuleProvider root id="feature:owner">
                <OwnerProbe />
                <Nested />
            </ModuleProvider>
        )

        // The inherit module chain-resolves the ancestor's ModuleMetadata and shares its id.
        expect(inheritId).toBe("feature:owner")
        expect(inheritId).toBe(ownerId)
    })

    it("creates a new container on root rebuild", () => {
        rebuildModule = null
        lastContainer = null
        prevContainer = null

        render(
            <ModuleProvider root>
                <ModuleProbe testId="root" />
            </ModuleProvider>
        )

        act(() => {
            rebuildModule?.()
        })

        // A fresh container proves the rebuild happened.
        expect(screen.getByTestId("root-same-container").textContent).toBe("different")
    })

    it("creates a new container on factory rebuild", () => {
        rebuildModule = null
        lastContainer = null
        prevContainer = null

        render(
            <ModuleProvider factory={() => Container.createChildContainer()}>
                <ModuleProbe testId="factory" />
            </ModuleProvider>
        )

        act(() => {
            rebuildModule?.()
        })

        // A fresh container detects the rebuild.
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

        expect(screen.getByTestId("id").textContent).toBeTruthy()

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

        expect(screen.getByTestId("strict-id").textContent).toBeTruthy()
    })

    it("threads a params-supplied id as the single value for context.id and metadata.id", () => {
        function Probe() {
            const { id, container } = useModuleContext()
            return (
                <div>
                    <span data-testid="ctx-id">{id}</span>
                    <span data-testid="meta-id">{container.resolve(ModuleMetadata).id}</span>
                </div>
            )
        }

        render(
            <ModuleProvider root id="feature:users">
                <Probe />
            </ModuleProvider>
        )

        // One value threaded everywhere: the public context id and the metadata id are the same string.
        expect(screen.getByTestId("ctx-id").textContent).toBe("feature:users")
        expect(screen.getByTestId("meta-id").textContent).toBe("feature:users")
    })

    it("gives sibling modules distinct generated ids", () => {
        function IdProbe({ testId }: { testId: string }) {
            return <span data-testid={testId}>{useModuleContext().id}</span>
        }

        render(
            <>
                <ModuleProvider root>
                    <IdProbe testId="sibling-a" />
                </ModuleProvider>
                <ModuleProvider root>
                    <IdProbe testId="sibling-b" />
                </ModuleProvider>
            </>
        )

        const a = screen.getByTestId("sibling-a").textContent
        const b = screen.getByTestId("sibling-b").textContent
        expect(a).toBeTruthy()
        expect(b).toBeTruthy()
        expect(a).not.toBe(b)
    })
})
