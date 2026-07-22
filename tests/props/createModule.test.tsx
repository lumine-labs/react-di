import { act, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"

import { createModule } from "../../src/react/factories/createModule"
import { PropsRef } from "../../src/core/providers/props-ref/props-ref.provider"
import { useResolve } from "../../src/react/hooks/useResolve"
import type { PropsAdapter } from "../../src/core/providers/props-ref/props-ref.provider"
import type { InjectionToken } from "../../src/aliases/index"

// Auto-bridge
// ========================================

type UserProps = { userId: string; name: string }

class UserService {
    static instances = 0
    readonly seq = ++UserService.instances

    // No decorators: the auto-bridged PropsRef is injected via the factory's `inject` list.
    constructor(readonly props: PropsRef<UserProps>) {}
}

// The factory declares NOTHING props-related — createModule bridges its props automatically.
const UserModule = createModule<UserProps>((props) => ({
    root: true,
    rebuildOn: [props.userId],
    providers: [
        {
            provide: UserService,
            useFactory: (ref: PropsRef<UserProps>) => new UserService(ref),
            inject: [PropsRef],
        },
    ],
}))

let capturedRef: PropsRef<UserProps> | null = null
let capturedSeq: number | null = null

function Probe() {
    const service = useResolve(UserService)
    capturedRef = service.props
    capturedSeq = service.seq
    return <span data-testid="name">{service.props.current.name}</span>
}

let setProps: ((props: UserProps) => void) | null = null

function Harness() {
    const [props, setPropsState] = useState<UserProps>({ userId: "u1", name: "Ann" })
    setProps = setPropsState
    return (
        <UserModule {...props}>
            <Probe />
        </UserModule>
    )
}

describe("createModule auto-bridge", () => {
    beforeEach(() => {
        UserService.instances = 0
        capturedRef = null
        capturedSeq = null
        setProps = null
    })

    it("bridges props automatically, updates on data props, and keeps the bridge across identity rebuilds", () => {
        render(<Harness />)

        expect(screen.getByTestId("name").textContent).toBe("Ann")
        expect(capturedSeq).toBe(1)
        const firstRef = capturedRef

        // Change a data prop only -> the bridge value updates, no rebuild (same service + bridge).
        act(() => {
            setProps?.({ userId: "u1", name: "Bob" })
        })
        expect(capturedSeq).toBe(1)
        expect(capturedRef).toBe(firstRef)
        expect(capturedRef!.current.name).toBe("Bob")

        // Change the identity prop -> rebuild: new service, SAME component-owned bridge, fresh value.
        act(() => {
            setProps?.({ userId: "u2", name: "Cara" })
        })
        expect(capturedSeq).toBe(2)
        expect(capturedRef).toBe(firstRef)
        expect(capturedRef!.current.name).toBe("Cara")
    })
})

// Options pass-through (adapter + custom token)
// ========================================

type Point = { x: number }
type Boxed = { boxed: Point }

const CUSTOM: InjectionToken<PropsRef<Boxed>> = Symbol.for("tests.createModule.custom")

// Module-scope adapter: identity-stable by construction — the recommended shape for boundary modules.
const boxAdapter: PropsAdapter<Point, Boxed> = {
    create: vi.fn((initial: Point) => ({ boxed: initial })),
    update: vi.fn(({ current, next }: { current: Boxed; next: Point }) => {
        current.boxed = next
        return current
    }),
}

const PointModule = createModule<Point, Boxed>({ root: true }, { adapter: boxAdapter, token: CUSTOM })

describe("createModule options (adapter + token)", () => {
    it("bridges through the adapter under the custom token", () => {
        let captured: PropsRef<Boxed> | null = null

        function PointProbe() {
            captured = useResolve(CUSTOM)
            return null
        }

        let setPoint: ((p: Point) => void) | null = null

        function PointHarness() {
            const [point, setPointState] = useState<Point>({ x: 1 })
            setPoint = setPointState
            return (
                <PointModule {...point}>
                    <PointProbe />
                </PointModule>
            )
        }

        render(<PointHarness />)

        expect(boxAdapter.create).toHaveBeenCalledTimes(1)
        expect(boxAdapter.create).toHaveBeenCalledWith({ x: 1 })
        const target = (boxAdapter.create as ReturnType<typeof vi.fn>).mock.results[0].value
        expect(captured!.current).toBe(target)

        act(() => {
            setPoint?.({ x: 2 })
        })

        expect(boxAdapter.update).toHaveBeenCalledTimes(1)
        expect(boxAdapter.update).toHaveBeenCalledWith({ current: target, next: { x: 2 } })
        expect(captured!.current).toBe(target)
    })
})
