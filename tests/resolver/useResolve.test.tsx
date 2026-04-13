import { fireEvent, render, screen } from "@testing-library/react"
import { useRef, useState } from "react"
import { describe, expect, it } from "vitest"

import { ModuleProvider } from "../../src/react/providers/ModuleProvider"
import { useResolve, useTryResolve } from "../../src/react/hooks/useResolve"

class ServiceA {
    readonly value = "ok"
}

const TMissing = Symbol.for("tests.resolver.missing")
const TFactoryThrow = Symbol.for("tests.resolver.factory-throw")

describe("resolver hooks", () => {
    it("useResolve resolves registered dependency from current module", () => {
        function Probe() {
            const service = useResolve(ServiceA)
            return <div>{service.value}</div>
        }

        render(
            <ModuleProvider root providers={[ServiceA]}>
                <Probe />
            </ModuleProvider>
        )

        expect(screen.getByText("ok")).toBeInTheDocument()
    })

    it("useTryResolve returns undefined for missing token", () => {
        function Probe() {
            const resolved = useTryResolve<string>(TMissing)
            return <div>{resolved === undefined ? "undefined" : "value"}</div>
        }

        render(
            <ModuleProvider root>
                <Probe />
            </ModuleProvider>
        )

        expect(screen.getByText("undefined")).toBeInTheDocument()
    })

    it("useTryResolve supports recursive=false and does not lookup parent module", () => {
        function ChildProbe() {
            const resolved = useTryResolve<ServiceA>(ServiceA, false)
            return <div>{resolved === undefined ? "undefined-local" : "value"}</div>
        }

        render(
            <ModuleProvider root providers={[ServiceA]}>
                <ModuleProvider>
                    <ChildProbe />
                </ModuleProvider>
            </ModuleProvider>
        )

        expect(screen.getByText("undefined-local")).toBeInTheDocument()
    })

    it("useTryResolve rethrows resolution errors for registered tokens", () => {
        function Probe() {
            useTryResolve(TFactoryThrow)
            return null
        }

        expect(() =>
            render(
                <ModuleProvider
                    root
                    providers={[
                        {
                            provide: TFactoryThrow,
                            useFactory: () => {
                                throw new Error("factory failed")
                            },
                        },
                    ]}
                >
                    <Probe />
                </ModuleProvider>
            )
        ).toThrowError("factory failed")
    })

    it("useResolve keeps reference stable across rerenders when container/token are unchanged", () => {
        function Probe() {
            const service = useResolve(ServiceA)
            const firstRef = useRef<ServiceA | null>(null)
            const [, setTick] = useState(0)

            if (!firstRef.current) {
                firstRef.current = service
            }

            const sameRef = firstRef.current === service

            return (
                <div>
                    <button type="button" onClick={() => setTick((v) => v + 1)}>
                        rerender
                    </button>
                    <span data-testid="same-ref">{sameRef ? "same" : "different"}</span>
                </div>
            )
        }

        render(
            <ModuleProvider root providers={[ServiceA]}>
                <Probe />
            </ModuleProvider>
        )

        expect(screen.getByTestId("same-ref").textContent).toBe("same")
        fireEvent.click(screen.getByRole("button", { name: "rerender" }))
        expect(screen.getByTestId("same-ref").textContent).toBe("same")
    })

    it("useResolve throws when recursive=false and token exists only in parent", () => {
        function ChildProbe() {
            useResolve(ServiceA, false)
            return null
        }

        expect(() =>
            render(
                <ModuleProvider root providers={[ServiceA]}>
                    <ModuleProvider>
                        <ChildProbe />
                    </ModuleProvider>
                </ModuleProvider>
            )
        ).toThrowError(/current module container/)
    })
})
