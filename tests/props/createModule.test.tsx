import { act, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"

import { createModule } from "../../src/react/factories/createModule.js"
import { ModuleProvider } from "../../src/react/providers/ModuleProvider.js"
import { PropsRef, type PropsAdapter } from "../../src/core/providers/props-ref/props-ref.provider.js"
import { useModuleContext } from "../../src/react/hooks/useModuleContext.js"
import { useResolve, useResolveSafe } from "../../src/react/hooks/useResolve.js"
import { Container } from "../../src/container/index.js"
import type { InjectionToken } from "../../src/container/index.js"

// `createModule` is `ModuleProvider` plus an automatic props bridge: whatever the component is rendered
// with reaches the container as a `PropsRef`, without the module declaring anything props-related.

type UserProps = { userId: string; name: string }

// Params object
// ========================================

describe("createModule with a params object", () => {
    it("bridges the component's props and honours the declared params", () => {
        const UserModule = createModule<UserProps>({ root: true, id: "user-module", providers: [] })

        let bridged: PropsRef<UserProps> | null = null
        let moduleId: string | null = null

        function Probe() {
            bridged = useResolve(PropsRef) as PropsRef<UserProps>
            moduleId = useModuleContext().id
            return <span data-testid="name">{bridged.current.name}</span>
        }

        render(
            <UserModule userId="u1" name="Ann">
                <Probe />
            </UserModule>
        )

        expect(moduleId).toBe("user-module")
        expect(bridged!.current).toEqual({ userId: "u1", name: "Ann" })
        expect(screen.getByTestId("name").textContent).toBe("Ann")
    })

    it("keeps children out of the bridged props", () => {
        const UserModule = createModule<UserProps>({ root: true })

        let bridged: PropsRef<UserProps> | null = null

        function Probe() {
            bridged = useResolve(PropsRef) as PropsRef<UserProps>
            return null
        }

        render(
            <UserModule userId="u1" name="Ann">
                <Probe />
            </UserModule>
        )

        expect(Object.keys(bridged!.current)).toEqual(["userId", "name"])
        expect("children" in (bridged!.current as object)).toBe(false)
    })

    it("registers the bridge alongside the declared providers, in that order", () => {
        class Flag {
            readonly on = true
        }

        const UserModule = createModule<UserProps>({
            root: true,
            providers: [{ provide: Flag, useValue: new Flag() }],
        })

        let bridged: PropsRef<UserProps> | undefined
        let flag: Flag | undefined

        function Probe() {
            bridged = useResolveSafe(PropsRef) as PropsRef<UserProps> | undefined
            flag = useResolveSafe(Flag)
            return null
        }

        render(
            <UserModule userId="u1" name="Ann">
                <Probe />
            </UserModule>
        )

        expect(bridged).toBeInstanceOf(PropsRef)
        expect(flag?.on).toBe(true)
    })

    it("tracks later props on the same bridge instance", () => {
        const UserModule = createModule<UserProps>({ root: true })

        let bridged: PropsRef<UserProps> | null = null
        let setProps: ((props: UserProps) => void) | null = null

        function Probe() {
            bridged = useResolve(PropsRef) as PropsRef<UserProps>
            return null
        }

        function Harness() {
            const [props, setPropsState] = useState<UserProps>({ userId: "u1", name: "Ann" })
            setProps = setPropsState
            return (
                <UserModule {...props}>
                    <Probe />
                </UserModule>
            )
        }

        render(<Harness />)
        const first = bridged

        act(() => setProps?.({ userId: "u1", name: "Bob" }))

        expect(bridged).toBe(first)
        expect(bridged!.current).toEqual({ userId: "u1", name: "Bob" })
    })
})

// Params from props
// ========================================

describe("createModule with a params callback", () => {
    it("calls the callback with the props minus children and uses what it returns", () => {
        const seen: UserProps[] = []

        const UserModule = createModule<UserProps>((props) => {
            seen.push(props)
            return { root: true, id: `user-${props.userId}` }
        })

        let moduleId: string | null = null

        function Probe() {
            moduleId = useModuleContext().id
            return null
        }

        render(
            <UserModule userId="u7" name="Ann">
                <Probe />
            </UserModule>
        )

        expect(seen[0]).toEqual({ userId: "u7", name: "Ann" })
        expect(moduleId).toBe("user-u7")
    })

    it("does not change the module id without a rebuild, because id is read once per resolution", () => {
        const UserModule = createModule<UserProps>((props) => ({ root: true, id: `user-${props.userId}` }))

        const ids: string[] = []
        let setProps: ((props: UserProps) => void) | null = null

        function Probe() {
            ids.push(useModuleContext().id)
            return null
        }

        function Harness() {
            const [props, setPropsState] = useState<UserProps>({ userId: "u1", name: "Ann" })
            setProps = setPropsState
            return (
                <UserModule {...props}>
                    <Probe />
                </UserModule>
            )
        }

        render(<Harness />)
        act(() => setProps?.({ userId: "u2", name: "Ann" }))

        expect(ids[0]).toBe("user-u1")
        expect(ids.at(-1)).toBe("user-u1")
    })

    it("re-runs on every render, always with the current props", () => {
        const seen: UserProps[] = []

        const UserModule = createModule<UserProps>((props) => {
            seen.push(props)
            return { root: true }
        })

        let setProps: ((props: UserProps) => void) | null = null

        function Harness() {
            const [props, setPropsState] = useState<UserProps>({ userId: "u1", name: "Ann" })
            setProps = setPropsState
            return <UserModule {...props} />
        }

        render(<Harness />)
        act(() => setProps?.({ userId: "u1", name: "Bob" }))

        expect(seen[0]).toEqual({ userId: "u1", name: "Ann" })
        expect(seen.at(-1)).toEqual({ userId: "u1", name: "Bob" })
    })
})

// Options: adapter + token
// ========================================

describe("createModule with { adapter, token }", () => {
    type Point = { x: number }
    type Boxed = { boxed: Point }

    const CUSTOM: InjectionToken<PropsRef<Boxed>> = Symbol.for("tests.createModule.custom")

    it("bridges through the adapter under the custom token", () => {
        const adapter: PropsAdapter<Point, Boxed> = {
            create: vi.fn((initial: Point) => ({ boxed: initial })),
            update: vi.fn(({ current, next }: { current: Boxed; next: Point }) => {
                current.boxed = next
                return current
            }),
        }

        const PointModule = createModule<Point, Boxed>({ root: true }, { adapter, token: CUSTOM })

        let boxed: PropsRef<Boxed> | undefined
        let byClass: PropsRef<unknown> | undefined
        let setPoint: ((point: Point) => void) | null = null

        function Probe() {
            boxed = useResolveSafe(CUSTOM)
            byClass = useResolveSafe(PropsRef)
            return null
        }

        function Harness() {
            const [point, setPointState] = useState<Point>({ x: 1 })
            setPoint = setPointState
            return (
                <PointModule {...point}>
                    <Probe />
                </PointModule>
            )
        }

        render(<Harness />)

        expect(adapter.create).toHaveBeenCalledTimes(1)
        expect(adapter.create).toHaveBeenCalledWith({ x: 1 })
        expect(byClass).toBeUndefined()

        const target = vi.mocked(adapter.create).mock.results[0]!.value
        expect(boxed!.current).toBe(target)

        act(() => setPoint?.({ x: 2 }))

        expect(adapter.create).toHaveBeenCalledTimes(1)
        expect(adapter.update).toHaveBeenCalledTimes(1)
        expect(adapter.update).toHaveBeenCalledWith({ current: target, next: { x: 2 } })
        expect(boxed!.current).toBe(target)
        expect(boxed!.current.boxed).toEqual({ x: 2 })
    })
})

// Container modes
// ========================================

describe("createModule across the container modes", () => {
    it("registers the bridge on the container a factory hands over", () => {
        const containers: Container[] = []
        const UserModule = createModule<UserProps>({
            factory: () => {
                const container = new Container()
                containers.push(container)
                return container
            },
        })

        let bridged: PropsRef<UserProps> | null = null
        let own: Container | null = null

        function Probe() {
            bridged = useResolve(PropsRef) as PropsRef<UserProps>
            own = useModuleContext().container
            return null
        }

        render(
            <UserModule userId="u1" name="Ann">
                <Probe />
            </UserModule>
        )

        expect(containers).toHaveLength(1)
        expect(own).toBe(containers[0])
        expect(containers[0]!.isRegistered(PropsRef, false)).toBe(true)
        expect(bridged!.current).toEqual({ userId: "u1", name: "Ann" })
    })

    it("keeps the bridge across a rebuild of a scoped module under a parent", () => {
        const UserModule = createModule<UserProps>((props) => ({ rebuildOn: [props.userId] }))

        const containers: Container[] = []
        let bridged: PropsRef<UserProps> | null = null
        let parent: Container | null = null
        let setProps: ((props: UserProps) => void) | null = null

        function Probe() {
            bridged = useResolve(PropsRef) as PropsRef<UserProps>
            containers.push(useModuleContext().container)
            return null
        }

        function ParentProbe() {
            parent = useModuleContext().container
            return null
        }

        function Harness() {
            const [props, setPropsState] = useState<UserProps>({ userId: "u1", name: "Ann" })
            setProps = setPropsState
            return (
                <ModuleProvider root id="app">
                    <ParentProbe />
                    <UserModule {...props}>
                        <Probe />
                    </UserModule>
                </ModuleProvider>
            )
        }

        render(<Harness />)
        const first = bridged
        const firstContainer = containers.at(-1)

        act(() => setProps?.({ userId: "u2", name: "Cara" }))

        expect(containers.at(-1)).not.toBe(firstContainer)
        expect(bridged).toBe(first)
        expect(bridged!.current).toEqual({ userId: "u2", name: "Cara" })
        // Still a child of the same parent: the bridge resolves locally, `app` does not know it.
        expect(parent!.isRegistered(PropsRef, false)).toBe(false)
        expect(containers.at(-1)!.isRegistered(PropsRef, false)).toBe(true)
    })
})

// Clashing with the auto-bridge
// ========================================

describe("createModule and a hand-rolled bridge", () => {
    it("refuses a second provider on the same token", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {})

        const Clashing = createModule<UserProps>({
            root: true,
            providers: [{ provide: PropsRef, useValue: new PropsRef({ props: {} }) }],
        })

        expect(() => render(<Clashing userId="u1" name="Ann" />)).toThrow(/already registered on this container/)

        spy.mockRestore()
    })
})

// No arguments
// ========================================

describe("createModule with no arguments", () => {
    it("still owns a scope and still bridges (empty) props", () => {
        const Scope = createModule()

        let bridged: PropsRef<object> | null = null
        let inner: string | null = null
        let outer: string | null = null

        function Probe() {
            bridged = useResolve(PropsRef) as PropsRef<object>
            inner = useModuleContext().id
            return null
        }

        function OuterProbe() {
            outer = useModuleContext().id
            return null
        }

        render(
            <ModuleProvider root id="app">
                <OuterProbe />
                <Scope>
                    <Probe />
                </Scope>
            </ModuleProvider>
        )

        expect(outer).toBe("app")
        expect(inner).not.toBe("app")
        expect(bridged!.current).toEqual({})
    })

    it("is named Module for devtools", () => {
        const Scope = createModule()
        expect((Scope as { displayName?: string }).displayName).toBe("Module")
    })

    it("throws without an enclosing module, because it declares neither root nor factory", () => {
        const Scope = createModule()
        const spy = vi.spyOn(console, "error").mockImplementation(() => {})

        expect(() => render(<Scope />)).toThrow(/No parent container in context/)

        spy.mockRestore()
    })
})

// rebuildOn derived from props
// ========================================

describe("createModule rebuilding on a props-derived key", () => {
    class UserService {
        static instances = 0
        readonly seq = ++UserService.instances
        readonly seen: UserProps[] = []
        readonly off: () => void
        /** What the bridge held at construction time — the rebuild must not hand back stale props. */
        readonly initial: UserProps

        constructor(readonly props: PropsRef<UserProps>) {
            this.initial = props.current
            this.off = props.onUpdate((next) => void this.seen.push(next))
        }

        onModuleDestroy() {
            this.off()
        }
    }

    // The module declares nothing props-related: `createModule` bridges, and the factory injects.
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

    let service: UserService | null = null
    let setProps: ((props: UserProps) => void) | null = null

    function Probe() {
        service = useResolve(UserService)
        return <span data-testid="name">{service.props.current.name}</span>
    }

    function Harness() {
        const [props, setPropsState] = useState<UserProps>({ userId: "u1", name: "Ann" })
        setProps = setPropsState
        return (
            <UserModule {...props}>
                <Probe />
            </UserModule>
        )
    }

    beforeEach(() => {
        UserService.instances = 0
        service = null
        setProps = null
    })

    it("keeps the component-owned bridge while the module around it is rebuilt", async () => {
        render(<Harness />)

        expect(service!.seq).toBe(1)
        const bridge = service!.props
        expect(bridge.current).toEqual({ userId: "u1", name: "Ann" })
        expect(screen.getByTestId("name").textContent).toBe("Ann")

        // A data-only change: the bridge moves, the module does not rebuild.
        act(() => setProps?.({ userId: "u1", name: "Bob" }))
        expect(service!.seq).toBe(1)
        expect(service!.props).toBe(bridge)
        expect(bridge.current).toEqual({ userId: "u1", name: "Bob" })
        expect(service!.seen).toEqual([{ userId: "u1", name: "Bob" }])

        // An identity change: a new service off a new container, but the same bridge instance.
        act(() => setProps?.({ userId: "u2", name: "Cara" }))
        expect(service!.seq).toBe(2)
        expect(service!.props).toBe(bridge)
        expect(bridge.current).toEqual({ userId: "u2", name: "Cara" })
        expect(screen.getByTestId("name").textContent).toBe("Cara")

        // The bridge is updated before the rebuilt module constructs anything, so the new service is
        // never handed the props that triggered its own rebuild.
        expect(service!.initial).toEqual({ userId: "u2", name: "Cara" })
        expect(service!.seen).toEqual([])

        // Let the torn-down module's onModuleDestroy run, releasing the old service's subscription.
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20))
        })

        act(() => setProps?.({ userId: "u2", name: "Dee" }))
        expect(service!.seq).toBe(2)
        expect(service!.seen).toEqual([{ userId: "u2", name: "Dee" }])
    })

    it("does not re-run the adapter's create across a rebuild", () => {
        type Boxed = { boxed: UserProps }
        const TOKEN: InjectionToken<PropsRef<Boxed>> = Symbol.for("tests.createModule.rebuild-adapter")

        const adapter: PropsAdapter<UserProps, Boxed> = {
            create: vi.fn((initial: UserProps) => ({ boxed: initial })),
            update: vi.fn(({ current, next }: { current: Boxed; next: UserProps }) => {
                current.boxed = next
                return current
            }),
        }

        const AdaptedModule = createModule<UserProps, Boxed>(
            (props) => ({ root: true, rebuildOn: [props.userId] }),
            { adapter, token: TOKEN }
        )

        let boxed: PropsRef<Boxed> | null = null
        const ids: string[] = []
        let setLocalProps: ((props: UserProps) => void) | null = null

        function AdaptedProbe() {
            boxed = useResolve(TOKEN)
            ids.push(useModuleContext().id)
            return null
        }

        function AdaptedHarness() {
            const [props, setPropsState] = useState<UserProps>({ userId: "u1", name: "Ann" })
            setLocalProps = setPropsState
            return (
                <AdaptedModule {...props}>
                    <AdaptedProbe />
                </AdaptedModule>
            )
        }

        render(<AdaptedHarness />)

        expect(adapter.create).toHaveBeenCalledTimes(1)
        const target = vi.mocked(adapter.create).mock.results[0]!.value
        const before = boxed

        act(() => setLocalProps?.({ userId: "u2", name: "Cara" }))

        // A new module (new id), the same bridge and the same adapter target.
        expect(new Set(ids).size).toBe(2)
        expect(adapter.create).toHaveBeenCalledTimes(1)
        expect(boxed).toBe(before)
        expect(boxed!.current).toBe(target)
        expect(adapter.update).toHaveBeenCalledWith({ current: target, next: { userId: "u2", name: "Cara" } })
    })

    it("stops delivering to a service the rebuild destroyed", async () => {
        render(<Harness />)

        const first = service!
        expect(first.seq).toBe(1)

        act(() => setProps?.({ userId: "u2", name: "Cara" }))
        const second = service!
        expect(second.seq).toBe(2)
        expect(second).not.toBe(first)

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20))
        })

        const firstCount = first.seen.length
        act(() => setProps?.({ userId: "u2", name: "Dee" }))

        expect(first.seen).toHaveLength(firstCount)
        expect(second.seen.at(-1)).toEqual({ userId: "u2", name: "Dee" })
    })
})
