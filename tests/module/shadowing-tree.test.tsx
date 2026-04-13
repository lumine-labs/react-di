import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ModuleProvider } from "../../src/react/providers/ModuleProvider"
import { useResolve } from "../../src/react/hooks/useResolve"

const TShared = Symbol.for("tests.shadow.shared")
const TRootOnly = Symbol.for("tests.shadow.root-only")

function RootProbe() {
    const shared = useResolve<string>(TShared)
    const rootOnly = useResolve<string>(TRootOnly)

    return (
        <div>
            <span data-testid="root-shared">{shared}</span>
            <span data-testid="root-root-only">{rootOnly}</span>
        </div>
    )
}

function ChildProbe() {
    const shared = useResolve<string>(TShared)
    const rootOnly = useResolve<string>(TRootOnly)

    return (
        <div>
            <span data-testid="child-shared">{shared}</span>
            <span data-testid="child-root-only">{rootOnly}</span>
        </div>
    )
}

function GrandchildProbe() {
    const shared = useResolve<string>(TShared)
    const rootOnly = useResolve<string>(TRootOnly)

    return (
        <div>
            <span data-testid="grand-shared">{shared}</span>
            <span data-testid="grand-root-only">{rootOnly}</span>
        </div>
    )
}

describe("module tree shadowing", () => {
    it("resolves nearest token override across root -> child -> grandchild", () => {
        render(
            <ModuleProvider
                root
                providers={[
                    { provide: TShared, useValue: "root" },
                    { provide: TRootOnly, useValue: "root-only" },
                ]}
            >
                <RootProbe />
                <ModuleProvider providers={[{ provide: TShared, useValue: "child" }]}>
                    <ChildProbe />
                    <ModuleProvider providers={[{ provide: TShared, useValue: "grandchild" }]}>
                        <GrandchildProbe />
                    </ModuleProvider>
                </ModuleProvider>
            </ModuleProvider>
        )

        expect(screen.getByTestId("root-shared").textContent).toBe("root")
        expect(screen.getByTestId("child-shared").textContent).toBe("child")
        expect(screen.getByTestId("grand-shared").textContent).toBe("grandchild")

        expect(screen.getByTestId("root-root-only").textContent).toBe("root-only")
        expect(screen.getByTestId("child-root-only").textContent).toBe("root-only")
        expect(screen.getByTestId("grand-root-only").textContent).toBe("root-only")
    })
})
