import { act, render, screen } from "@testing-library/react"
import { useRef, useState } from "react"
import { describe, expect, it } from "vitest"

import { ModuleProvider } from "../../src/react/providers/ModuleProvider"
import { useResolveAll } from "../../src/react/hooks/useResolveAll"

const TMulti = Symbol.for("tests.resolveAll.multi")
const TMissing = Symbol.for("tests.resolveAll.missing")
const TOKEN_A = Symbol.for("tests.resolveAll.a")
const TOKEN_B = Symbol.for("tests.resolveAll.b")

describe("useResolveAll", () => {
    it("returns every registration for a token in registration order", () => {
        function Probe() {
            const values = useResolveAll<string>(TMulti)
            return <div>{values.join(",")}</div>
        }

        render(
            <ModuleProvider
                root
                providers={[
                    { provide: TMulti, useValue: "first" },
                    { provide: TMulti, useValue: "second" },
                    { provide: TMulti, useValue: "third" },
                ]}
            >
                <Probe />
            </ModuleProvider>
        )

        expect(screen.getByText("first,second,third")).toBeInTheDocument()
    })

    it("returns an empty array for an unregistered token", () => {
        function Probe() {
            const values = useResolveAll<string>(TMissing)
            return <div>{values.length === 0 ? "empty" : "not-empty"}</div>
        }

        render(
            <ModuleProvider root>
                <Probe />
            </ModuleProvider>
        )

        expect(screen.getByText("empty")).toBeInTheDocument()
    })

    it("keeps the empty array identity stable across re-renders", () => {
        let sameRef = false
        let forceTick: (() => void) | null = null

        function Probe() {
            const values = useResolveAll<string>(TMissing)
            const firstRef = useRef<string[] | null>(null)
            const [, setTick] = useState(0)
            forceTick = () => setTick((v) => v + 1)

            if (!firstRef.current) {
                firstRef.current = values
            }
            sameRef = firstRef.current === values
            return <div>{sameRef ? "same" : "different"}</div>
        }

        render(
            <ModuleProvider root>
                <Probe />
            </ModuleProvider>
        )

        expect(screen.getByText("same")).toBeInTheDocument()
        act(() => forceTick?.())
        expect(screen.getByText("same")).toBeInTheDocument()
    })

    it("keeps the resolved array identity stable across re-renders (snapshot semantics)", () => {
        let sameRef = false
        let forceTick: (() => void) | null = null

        function Probe() {
            const values = useResolveAll<string>(TMulti)
            const firstRef = useRef<string[] | null>(null)
            const [, setTick] = useState(0)
            forceTick = () => setTick((v) => v + 1)

            if (!firstRef.current) {
                firstRef.current = values
            }
            sameRef = firstRef.current === values
            return <div>{sameRef ? "same" : "different"}</div>
        }

        render(
            <ModuleProvider
                root
                providers={[
                    { provide: TMulti, useValue: "first" },
                    { provide: TMulti, useValue: "second" },
                ]}
            >
                <Probe />
            </ModuleProvider>
        )

        expect(screen.getByText("same")).toBeInTheDocument()
        act(() => forceTick?.())
        act(() => forceTick?.())
        expect(screen.getByText("same")).toBeInTheDocument()
    })

    it("re-resolves when the token changes", () => {
        let captured: string[] = []
        let switchToken: (() => void) | null = null

        function Probe() {
            const [token, setToken] = useState<symbol>(TOKEN_A)
            switchToken = () => setToken(TOKEN_B)
            captured = useResolveAll<string>(token)
            return null
        }

        render(
            <ModuleProvider
                root
                providers={[
                    { provide: TOKEN_A, useValue: "a" },
                    { provide: TOKEN_B, useValue: "b1" },
                    { provide: TOKEN_B, useValue: "b2" },
                ]}
            >
                <Probe />
            </ModuleProvider>
        )

        expect(captured).toEqual(["a"])

        act(() => switchToken?.())
        expect(captured).toEqual(["b1", "b2"])
    })
})
