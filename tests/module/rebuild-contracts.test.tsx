import { act, render, screen } from "@testing-library/react"
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
    it("gives every module its own generated id, never an ancestor's", () => {
        let ownerId: string | null = null
        let childId: string | null = null

        function OwnerProbe() {
            ownerId = useModuleContext().id
            return null
        }
        function ChildProbe() {
            childId = useModuleContext().id
            return null
        }

        render(
            <ModuleProvider root id="feature:owner">
                <OwnerProbe />
                <ModuleProvider>
                    <ChildProbe />
                </ModuleProvider>
            </ModuleProvider>
        )

        expect(ownerId).toBe("feature:owner")
        expect(childId).toBeTruthy()
        expect(childId).not.toBe(ownerId)
        expect(childId).toMatch(/^id:/)
    })

    it("gives a nested module its own container, distinct from the enclosing module's", () => {
        let ownerContainer: DependencyContainer | null = null
        let childContainer: DependencyContainer | null = null

        function OwnerProbe() {
            ownerContainer = useContainer()
            return null
        }
        function ChildProbe() {
            childContainer = useContainer()
            return null
        }

        render(
            <ModuleProvider root id="feature:owner">
                <OwnerProbe />
                <ModuleProvider id="feature:child">
                    <ChildProbe />
                </ModuleProvider>
            </ModuleProvider>
        )

        // One container = one module: the nested module never shares the ancestor's container, and each
        // container carries exactly its own ModuleMetadata.
        expect(ownerContainer).toBeTruthy()
        expect(childContainer).toBeTruthy()
        expect(childContainer).not.toBe(ownerContainer)
        expect(ownerContainer!.resolve(ModuleMetadata).id).toBe("feature:owner")
        expect(childContainer!.resolve(ModuleMetadata).id).toBe("feature:child")
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
