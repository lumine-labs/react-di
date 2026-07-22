import { act, fireEvent, render, screen } from "@testing-library/react"
import { useRef, useState } from "react"
import { beforeEach, describe, expect, it } from "vitest"

import { ModuleProvider } from "../../src/react/providers/ModuleProvider"
import { useModuleRebuild } from "../../src/react/hooks/useModuleContext"
import { useResolve, useTryResolve } from "../../src/react/hooks/useResolve"

class ServiceA {
    readonly value = "ok"
}

class TransientService {
    static instances = 0
    readonly seq = ++TransientService.instances
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

// Snapshot guarantees (lazy-ref, not useMemo)
// ========================================

describe("useResolve snapshot semantics", () => {
    beforeEach(() => {
        TransientService.instances = 0
    })

    it("returns the SAME transient instance across multiple parent re-renders", () => {
        let captured: TransientService | null = null
        let forceTick: (() => void) | null = null

        function Probe() {
            captured = useResolve(TransientService)
            return null
        }

        function Harness() {
            const [, setTick] = useState(0)
            forceTick = () => setTick((t) => t + 1)
            return (
                <ModuleProvider
                    root
                    providers={[{ provide: TransientService, useClass: TransientService, scope: "transient" }]}
                >
                    <Probe />
                </ModuleProvider>
            )
        }

        render(<Harness />)

        const first = captured
        expect(first).not.toBeNull()

        act(() => forceTick?.())
        act(() => forceTick?.())
        act(() => forceTick?.())

        // Transient scope would mint a fresh instance on any re-resolve; identity proves the snapshot.
        expect(captured).toBe(first)
    })

    it("re-resolves when the token changes", () => {
        const TOKEN_A = Symbol.for("tests.resolver.snapshot.a")
        const TOKEN_B = Symbol.for("tests.resolver.snapshot.b")

        let captured: string | null = null
        let switchToken: (() => void) | null = null

        function Probe() {
            const [token, setToken] = useState<symbol>(TOKEN_A)
            switchToken = () => setToken(TOKEN_B)
            captured = useResolve<string>(token)
            return null
        }

        render(
            <ModuleProvider
                root
                providers={[
                    { provide: TOKEN_A, useValue: "a" },
                    { provide: TOKEN_B, useValue: "b" },
                ]}
            >
                <Probe />
            </ModuleProvider>
        )

        expect(captured).toBe("a")

        act(() => switchToken?.())
        expect(captured).toBe("b")
    })

    it("re-resolves when the recursive flag changes", () => {
        let captured: ServiceA | undefined | null = null
        let flip: (() => void) | null = null

        function ChildProbe() {
            const [recursive, setRecursive] = useState(true)
            flip = () => setRecursive(false)
            captured = useTryResolve(ServiceA, recursive)
            return null
        }

        render(
            <ModuleProvider root providers={[ServiceA]}>
                <ModuleProvider>
                    <ChildProbe />
                </ModuleProvider>
            </ModuleProvider>
        )

        // recursive=true finds the parent's registration...
        expect(captured).toBeInstanceOf(ServiceA)

        // ...flipping to recursive=false re-resolves against the child container only.
        act(() => flip?.())
        expect(captured).toBeUndefined()
    })

    it("re-resolves from the new container after a module rebuild", () => {
        let captured: TransientService | null = null
        let rebuildModule: (() => void) | null = null

        function Probe() {
            captured = useResolve(TransientService)
            rebuildModule = useModuleRebuild()
            return null
        }

        render(
            <ModuleProvider
                root
                providers={[{ provide: TransientService, useClass: TransientService, scope: "transient" }]}
            >
                <Probe />
            </ModuleProvider>
        )

        const first = captured
        expect(first).not.toBeNull()

        act(() => rebuildModule?.())

        // Rebuild swaps the context container -> snapshot input change -> fresh resolution.
        expect(captured).not.toBe(first)
        expect(captured).toBeInstanceOf(TransientService)
    })

    it("useTryResolve keeps a stable undefined for missing tokens and stable identity for transient values", () => {
        let capturedMissing: unknown = "sentinel"
        let capturedService: TransientService | undefined | null = null
        let forceTick: (() => void) | null = null

        function Probe() {
            capturedMissing = useTryResolve(TMissing)
            capturedService = useTryResolve(TransientService)
            return null
        }

        function Harness() {
            const [, setTick] = useState(0)
            forceTick = () => setTick((t) => t + 1)
            return (
                <ModuleProvider
                    root
                    providers={[{ provide: TransientService, useClass: TransientService, scope: "transient" }]}
                >
                    <Probe />
                </ModuleProvider>
            )
        }

        render(<Harness />)

        expect(capturedMissing).toBeUndefined()
        const firstService = capturedService
        expect(firstService).toBeInstanceOf(TransientService)

        act(() => forceTick?.())
        act(() => forceTick?.())

        expect(capturedMissing).toBeUndefined()
        expect(capturedService).toBe(firstService)
    })
})
