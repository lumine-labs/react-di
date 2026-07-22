import { act, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { useState } from "react"

import { ModuleProvider } from "../../src/react/providers/ModuleProvider"
import { PropsRef } from "../../src/core/providers/props-ref/props-ref.provider"
import { usePropsRef } from "../../src/react/hooks/usePropsRef"
import { useResolve } from "../../src/react/hooks/useResolve"
import type { InjectionToken } from "../../src/aliases/index"

type Data = { label: string; count: number }

let setOuter: ((data: Data) => void) | null = null

beforeEach(() => {
    setOuter = null
})

// Default mode — instance pushed straight into providers
// ========================================

describe("usePropsRef default mode", () => {
    it("exposes initial props and replaces the value on re-render with changed props", () => {
        let captured: PropsRef<Data> | null = null
        let localRef: PropsRef<Data> | null = null

        function Probe() {
            const ref = useResolve(PropsRef) as PropsRef<Data>
            captured = ref
            return <span data-testid="label">{ref.current.label}</span>
        }

        function Harness() {
            const [data, setData] = useState<Data>({ label: "a", count: 1 })
            setOuter = setData
            // The hook returns the instance for local access and the ValueProvider literal to register.
            const { ref, provider } = usePropsRef(data)
            localRef = ref
            return (
                <ModuleProvider root providers={[provider]}>
                    <Probe />
                </ModuleProvider>
            )
        }

        render(<Harness />)

        expect(captured).not.toBeNull()
        // The resolved instance is the hook's own ref (return-shape contract).
        expect(captured).toBe(localRef)
        expect(captured!.current).toEqual({ label: "a", count: 1 })

        const firstInstance = captured
        const firstValue = captured!.current

        act(() => {
            setOuter?.({ label: "b", count: 2 })
        })

        // Same PropsRef instance (component-owned), fresh value object (default mode replaces).
        expect(captured).toBe(firstInstance)
        expect(captured!.current).not.toBe(firstValue)
        expect(captured!.current).toEqual({ label: "b", count: 2 })
    })
})

// Custom token via hook option
// ========================================

describe("usePropsRef custom token", () => {
    it("registers and resolves under the provided token, independently from a default-token bridge", () => {
        const OTHER: InjectionToken<PropsRef<{ n: number }>> = Symbol.for("tests.props.custom-token")

        let defaultRef: PropsRef<{ label: string }> | null = null
        let customRef: PropsRef<{ n: number }> | null = null

        let setLabel: ((v: string) => void) | null = null
        let setN: ((v: number) => void) | null = null

        function Probe() {
            defaultRef = useResolve(PropsRef) as PropsRef<{ label: string }>
            customRef = useResolve(OTHER)
            return null
        }

        function Harness() {
            const [label, setLabelState] = useState("a")
            const [n, setNState] = useState(1)
            setLabel = setLabelState
            setN = setNState

            const { provider: labelProvider } = usePropsRef({ label })
            const { provider: nProvider } = usePropsRef({ n }, { token: OTHER })

            return (
                <ModuleProvider root providers={[labelProvider, nProvider]}>
                    <Probe />
                </ModuleProvider>
            )
        }

        render(<Harness />)

        expect(defaultRef!.current).toEqual({ label: "a" })
        expect(customRef!.current).toEqual({ n: 1 })
        expect(defaultRef).not.toBe(customRef as unknown)

        act(() => {
            setLabel?.("b")
        })
        expect(defaultRef!.current).toEqual({ label: "b" })
        expect(customRef!.current).toEqual({ n: 1 })

        act(() => {
            setN?.(2)
        })
        expect(defaultRef!.current).toEqual({ label: "b" })
        expect(customRef!.current).toEqual({ n: 2 })
    })
})

// Class-token shadowing
// ========================================

describe("PropsRef class-token shadowing", () => {
    it("resolves the nearest module's PropsRef in each subtree", () => {
        function ParentProbe() {
            const ref = useResolve(PropsRef) as PropsRef<{ who: string }>
            return <span data-testid="parent">{ref.current.who}</span>
        }

        function ChildProbe() {
            const ref = useResolve(PropsRef) as PropsRef<{ who: string }>
            return <span data-testid="child">{ref.current.who}</span>
        }

        function Child() {
            const { provider } = usePropsRef({ who: "child" })
            return (
                <ModuleProvider providers={[provider]}>
                    <ChildProbe />
                </ModuleProvider>
            )
        }

        function Parent() {
            const { provider } = usePropsRef({ who: "parent" })
            return (
                <ModuleProvider root providers={[provider]}>
                    <ParentProbe />
                    <Child />
                </ModuleProvider>
            )
        }

        render(<Parent />)

        expect(screen.getByTestId("parent").textContent).toBe("parent")
        expect(screen.getByTestId("child").textContent).toBe("child")
    })
})
