import { act, render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"

import { ModuleProvider } from "../../src/react/providers/ModuleProvider"
import { PropsRef } from "../../src/core/providers/props-ref/props-ref.provider"
import { usePropsRef } from "../../src/react/hooks/usePropsRef"
import { useResolve } from "../../src/react/hooks/useResolve"
import type { PropsAdapter } from "../../src/core/providers/props-ref/props-ref.provider"
import type { InjectionToken } from "../../src/aliases/index"

type Data = { id: string; label: string }

// A service that follows the documented rule: store the off() from onUpdate, release it in
// onModuleDestroy — because the component-owned PropsRef outlives rebuilt-away services.
class SubscriberService {
    static created: SubscriberService[] = []

    readonly received: Data[] = []
    readonly off: () => void

    constructor(ref: PropsRef<Data>) {
        SubscriberService.created.push(this)
        this.off = ref.onUpdate((next) => {
            this.received.push(next)
        })
    }

    onModuleDestroy() {
        this.off()
    }
}

let resolvedRef: PropsRef<Data> | null = null
let setOuter: ((data: Data) => void) | null = null

function Probe() {
    resolvedRef = useResolve(PropsRef) as PropsRef<Data>
    return null
}

function Harness() {
    const [data, setData] = useState<Data>({ id: "a", label: "one" })
    setOuter = setData

    const { provider } = usePropsRef(data)

    return (
        <ModuleProvider
            root
            providers={[
                provider,
                {
                    provide: SubscriberService,
                    useFactory: (r: PropsRef<Data>) => new SubscriberService(r),
                    inject: [PropsRef],
                },
            ]}
            rebuildOn={[data.id]}
        >
            <Probe />
        </ModuleProvider>
    )
}

beforeEach(() => {
    SubscriberService.created = []
    resolvedRef = null
    setOuter = null
})

describe("PropsRef across module rebuilds", () => {
    it("keeps the same instance with fresh props, and unsubscribed-in-destroy services stop receiving", async () => {
        render(<Harness />)

        expect(SubscriberService.created).toHaveLength(1)
        const service1 = SubscriberService.created[0]
        const refBefore = resolvedRef
        expect(refBefore!.current).toEqual({ id: "a", label: "one" })

        // Data-only change: no rebuild, subscribed service receives the update.
        act(() => {
            setOuter?.({ id: "a", label: "two" })
        })
        expect(SubscriberService.created).toHaveLength(1)
        expect(service1.received).toContainEqual({ id: "a", label: "two" })

        // Identity change: module rebuilds — a NEW service, but the SAME component-owned PropsRef.
        act(() => {
            setOuter?.({ id: "b", label: "three" })
        })
        expect(SubscriberService.created).toHaveLength(2)
        const service2 = SubscriberService.created[1]

        // (a) instance identity survives the rebuild; (b) `current` is fresh across it.
        expect(resolvedRef).toBe(refBefore)
        expect(resolvedRef!.current).toEqual({ id: "b", label: "three" })

        // Let the scheduled destroy of the old resolution run (onModuleDestroy -> off()).
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20))
        })

        const service1Count = service1.received.length
        const service2Count = service2.received.length

        // (c) after destroy, only the live service receives further updates.
        act(() => {
            setOuter?.({ id: "b", label: "four" })
        })
        expect(service1.received).toHaveLength(service1Count)
        expect(service2.received).toHaveLength(service2Count + 1)
        expect(service2.received).toContainEqual({ id: "b", label: "four" })
    })

    it("keeps the adapter target stable across a rebuild (create not re-run)", () => {
        type Boxed = { boxed: Data }
        const TOKEN: InjectionToken<PropsRef<Boxed>> = Symbol.for("tests.props.rebuild.adapter")

        const adapter: PropsAdapter<Data, Boxed> = {
            create: vi.fn((initial: Data) => ({ boxed: initial })),
            update: vi.fn(({ current, next }: { current: Boxed; next: Data }) => {
                current.boxed = next
                return current
            }),
        }

        let captured: PropsRef<Boxed> | null = null

        function AdapterProbe() {
            captured = useResolve(TOKEN)
            return null
        }

        function AdapterHarness() {
            const [data, setData] = useState<Data>({ id: "a", label: "one" })
            setOuter = setData

            const { provider } = usePropsRef<Data, Boxed>(data, { adapter, token: TOKEN })

            return (
                <ModuleProvider root providers={[provider]} rebuildOn={[data.id]}>
                    <AdapterProbe />
                </ModuleProvider>
            )
        }

        render(<AdapterHarness />)

        expect(adapter.create).toHaveBeenCalledTimes(1)
        const target = (adapter.create as ReturnType<typeof vi.fn>).mock.results[0].value
        const refBefore = captured

        // Identity change rebuilds the module; the bridge and its adapter target survive.
        act(() => {
            setOuter?.({ id: "b", label: "two" })
        })

        expect(adapter.create).toHaveBeenCalledTimes(1)
        expect(captured).toBe(refBefore)
        expect(captured!.current).toBe(target)
        expect(adapter.update).toHaveBeenCalledWith({ current: target, next: { id: "b", label: "two" } })
    })
})
