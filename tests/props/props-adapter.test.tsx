import { act, render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"

import { ModuleProvider } from "../../src/react/providers/ModuleProvider"
import { PropsRef } from "../../src/core/providers/props-ref/props-ref.provider"
import { usePropsRef } from "../../src/react/hooks/usePropsRef"
import { useResolve } from "../../src/react/hooks/useResolve"
import type { PropsAdapter } from "../../src/core/providers/props-ref/props-ref.provider"
import type { InjectionToken } from "../../src/aliases/index"

type Data = { a: number }
type Boxed = { boxed: Data }

const TOKEN: InjectionToken<PropsRef<Boxed>> = Symbol.for("tests.props.adapter")

function makeAdapter(): PropsAdapter<Data, Boxed> {
    return {
        create: vi.fn((initial: Data) => ({ boxed: initial })),
        update: vi.fn(({ current, next }: { current: Boxed; next: Data }) => {
            current.boxed = next
            return current
        }),
    }
}

let captured: PropsRef<Boxed> | null = null
let setOuter: ((data: Data) => void) | null = null
let setAdapterOuter: ((adapter: PropsAdapter<Data, Boxed> | undefined) => void) | null = null

function Probe() {
    captured = useResolve(TOKEN)
    return null
}

function makeHarness(initialAdapter: PropsAdapter<Data, Boxed> | undefined) {
    return function Harness() {
        const [data, setData] = useState<Data>({ a: 1 })
        const [adapter, setAdapter] = useState<PropsAdapter<Data, Boxed> | undefined>(() => initialAdapter)
        setOuter = setData
        setAdapterOuter = setAdapter

        const { provider } = usePropsRef<Data, Boxed>(data, { adapter, token: TOKEN })

        return (
            <ModuleProvider root providers={[provider]}>
                <Probe />
            </ModuleProvider>
        )
    }
}

beforeEach(() => {
    captured = null
    setOuter = null
    setAdapterOuter = null
})

// Stable adapter
// ========================================

describe("usePropsRef with a stable adapter", () => {
    it("creates once, keeps a stable target, and gates update by shallow-equal", () => {
        const adapter = makeAdapter()
        const Harness = makeHarness(adapter)
        render(<Harness />)

        expect(adapter.create).toHaveBeenCalledTimes(1)
        expect(adapter.create).toHaveBeenCalledWith({ a: 1 })

        const target = (adapter.create as ReturnType<typeof vi.fn>).mock.results[0].value
        expect(captured!.current).toBe(target)

        // Re-render with shallow-equal props -> update NOT called, create not re-run.
        act(() => {
            setOuter?.({ a: 1 })
        })
        expect(adapter.update).not.toHaveBeenCalled()
        expect(adapter.create).toHaveBeenCalledTimes(1)

        // Real change -> update runs once against the original target; `current` stays that target.
        act(() => {
            setOuter?.({ a: 2 })
        })
        expect(adapter.update).toHaveBeenCalledTimes(1)
        expect(adapter.update).toHaveBeenCalledWith({ current: target, next: { a: 2 } })
        expect(captured!.current).toBe(target)
    })
})

// Adapter swap (adapter is a hook dependency)
// ========================================

describe("usePropsRef adapter swap", () => {
    it("rebuilds the target from current props with the new adapter and notifies subscribers", () => {
        const adapterA = makeAdapter()
        const adapterB = makeAdapter()
        const Harness = makeHarness(adapterA)
        render(<Harness />)

        // Advance props under adapter A first, so the swap must use CURRENT props, not initial.
        act(() => {
            setOuter?.({ a: 2 })
        })
        expect(adapterA.update).toHaveBeenCalledTimes(1)

        const notifications: Array<[Boxed, Boxed]> = []
        captured!.onUpdate((next, prev) => {
            notifications.push([next, prev])
        })

        const targetA = (adapterA.create as ReturnType<typeof vi.fn>).mock.results[0].value

        act(() => {
            setAdapterOuter?.(adapterB)
        })

        // New adapter created its target from the CURRENT props; subscribers saw (next, prev).
        expect(adapterB.create).toHaveBeenCalledTimes(1)
        expect(adapterB.create).toHaveBeenCalledWith({ a: 2 })
        const targetB = (adapterB.create as ReturnType<typeof vi.fn>).mock.results[0].value
        expect(captured!.current).toBe(targetB)
        expect(notifications).toHaveLength(1)
        expect(notifications[0][0]).toBe(targetB)
        expect(notifications[0][1]).toBe(targetA)

        // Old adapter is out of the loop; subsequent prop changes go to the new one.
        act(() => {
            setOuter?.({ a: 3 })
        })
        expect(adapterB.update).toHaveBeenCalledTimes(1)
        expect(adapterB.update).toHaveBeenCalledWith({ current: targetB, next: { a: 3 } })
        expect(adapterA.update).toHaveBeenCalledTimes(1)
        expect(adapterA.create).toHaveBeenCalledTimes(1)
    })

    it("reverts to the plain props object when the adapter is removed", () => {
        const adapter = makeAdapter()
        const Harness = makeHarness(adapter)
        render(<Harness />)

        const target = (adapter.create as ReturnType<typeof vi.fn>).mock.results[0].value
        expect(captured!.current).toBe(target)

        act(() => {
            setAdapterOuter?.(undefined)
        })

        // Default mode now: `current` is the plain current props object.
        expect(captured!.current as unknown as Data).toEqual({ a: 1 })
        expect(captured!.current).not.toBe(target)

        act(() => {
            setOuter?.({ a: 5 })
        })
        expect(captured!.current as unknown as Data).toEqual({ a: 5 })
        expect(adapter.update).not.toHaveBeenCalled()
    })
})
