import { act, render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"

import { ModuleProvider } from "../../src/react/providers/ModuleProvider"
import { PropsRef } from "../../src/core/providers/props-ref/props-ref.provider"
import { usePropsRef } from "../../src/react/hooks/usePropsRef"
import { useResolve } from "../../src/react/hooks/useResolve"

type Data = { v: number }

let resolved: PropsRef<Data> | null = null
let setV: ((v: number) => void) | null = null
let forceTick: (() => void) | null = null

function Probe() {
    resolved = useResolve(PropsRef) as PropsRef<Data>
    return null
}

function Harness() {
    const [v, setVState] = useState(1)
    const [, setTick] = useState(0)
    setV = setVState
    forceTick = () => setTick((t) => t + 1)

    const { provider } = usePropsRef({ v })

    return (
        <ModuleProvider root providers={[provider]}>
            <Probe />
        </ModuleProvider>
    )
}

beforeEach(() => {
    resolved = null
    setV = null
    forceTick = null
})

describe("PropsRef.onUpdate", () => {
    it("fires on real change with (next, prev), not on a shallow-equal re-render, and stops after off()", () => {
        render(<Harness />)

        const calls: Array<[Data, Data]> = []
        const off = resolved!.onUpdate((next, prev) => {
            calls.push([next, prev])
        })

        // Re-render with a fresh-but-shallow-equal props object -> no fire (gate inside update()).
        act(() => {
            forceTick?.()
        })
        expect(calls).toHaveLength(0)

        // Real change -> fires once with (next, prev).
        act(() => {
            setV?.(2)
        })
        expect(calls).toHaveLength(1)
        expect(calls[0][0]).toEqual({ v: 2 })
        expect(calls[0][1]).toEqual({ v: 1 })

        // Unsubscribe -> no further delivery.
        off()
        act(() => {
            setV?.(3)
        })
        expect(calls).toHaveLength(1)
    })

    it("with { immediate: true } fires synchronously at subscription with (current, current)", () => {
        render(<Harness />)

        let immediate: [Data, Data] | null = null
        resolved!.onUpdate(
            (next, prev) => {
                immediate = [next, prev]
            },
            { immediate: true }
        )

        expect(immediate).not.toBeNull()
        const current = resolved!.current
        expect(immediate![0]).toBe(current)
        expect(immediate![1]).toBe(current)
    })

    it("catches a throwing subscriber (console.error) without preventing other subscribers", () => {
        render(<Harness />)

        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
        const good = vi.fn()

        resolved!.onUpdate(() => {
            throw new Error("boom")
        })
        resolved!.onUpdate(good)

        act(() => {
            setV?.(2)
        })

        expect(good).toHaveBeenCalledTimes(1)
        expect(good).toHaveBeenCalledWith({ v: 2 }, { v: 1 })
        expect(errorSpy).toHaveBeenCalled()

        errorSpy.mockRestore()
    })
})
