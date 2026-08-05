import { act, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"

import { createModuleComponent } from "../../src/react/factories/createModuleComponent.js"
import { ModuleProvider } from "../../src/react/providers/ModuleProvider.js"
import { PropsRef, type PropsAdapter } from "../../src/core/providers/props-ref/props-ref.provider.js"
import { useContainer, useModuleContext } from "../../src/react/hooks/useModuleContext.js"
import { useResolve, useResolveOptional } from "../../src/react/hooks/useResolve.js"
import { Container, inject } from "@remodulo/container"
import type { InjectionToken } from "@remodulo/container"
import type { Provider } from "../../src/core/provider/provider.types.js"
import { Root } from "../setup/react.js"

// `createModuleComponent` is a scoped `ModuleProvider` plus an automatic props bridge: whatever the component is
// rendered with reaches the container as a `PropsRef`, without the module declaring anything props-related.
// Being scoped-only, every one of these needs a module in context — an `<AppProvider>` via `<Root>`.

type UserProps = { userId: string; name: string }

// Params object
// ========================================

describe("createModuleComponent with a params object", () => {
    it("bridges the component's props and honours the declared params", () => {
        const UserModule = createModuleComponent<UserProps>({ id: "user-module", providers: [] })

        let bridged: PropsRef<UserProps> | null = null
        let moduleId: string | null = null

        function Probe() {
            bridged = useResolve(PropsRef) as PropsRef<UserProps>
            moduleId = useModuleContext().module.id
            return <span data-testid="name">{bridged.current.name}</span>
        }

        render(
            <Root>
                <UserModule userId="u1" name="Ann">
                    <Probe />
                </UserModule>
            </Root>
        )

        expect(moduleId).toBe("user-module")
        expect(bridged!.current).toEqual({ userId: "u1", name: "Ann" })
        expect(screen.getByTestId("name").textContent).toBe("Ann")
    })

    it("keeps children out of the bridged props", () => {
        const UserModule = createModuleComponent<UserProps>()

        let bridged: PropsRef<UserProps> | null = null

        function Probe() {
            bridged = useResolve(PropsRef) as PropsRef<UserProps>
            return null
        }

        render(
            <Root>
                <UserModule userId="u1" name="Ann">
                    <Probe />
                </UserModule>
            </Root>
        )

        expect(Object.keys(bridged!.current)).toEqual(["userId", "name"])
        expect("children" in (bridged!.current as object)).toBe(false)
    })

    it("registers the bridge alongside the declared providers, in that order", () => {
        class Flag {
            readonly on = true
        }

        const UserModule = createModuleComponent<UserProps>({
            providers: [{ provide: Flag, useValue: new Flag() }],
        })

        let bridged: PropsRef<UserProps> | undefined
        let flag: Flag | undefined

        function Probe() {
            bridged = useResolveOptional(PropsRef) as PropsRef<UserProps> | undefined
            flag = useResolveOptional(Flag)
            return null
        }

        render(
            <Root>
                <UserModule userId="u1" name="Ann">
                    <Probe />
                </UserModule>
            </Root>
        )

        expect(bridged).toBeInstanceOf(PropsRef)
        expect(flag?.on).toBe(true)
    })

    it("tracks later props on the same bridge instance", () => {
        const UserModule = createModuleComponent<UserProps>()

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
                <Root>
                    <UserModule {...props}>
                        <Probe />
                    </UserModule>
                </Root>
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

describe("createModuleComponent with a params callback", () => {
    it("calls the callback with the props minus children and uses what it returns", () => {
        const seen: UserProps[] = []

        const UserModule = createModuleComponent<UserProps>((props) => {
            seen.push(props)
            return { id: `user-${props.userId}` }
        })

        let moduleId: string | null = null

        function Probe() {
            moduleId = useModuleContext().module.id
            return null
        }

        render(
            <Root>
                <UserModule userId="u7" name="Ann">
                    <Probe />
                </UserModule>
            </Root>
        )

        expect(seen[0]).toEqual({ userId: "u7", name: "Ann" })
        expect(moduleId).toBe("user-u7")
    })

    it("does not change the module id without a rebuild, because id is read once per resolution", () => {
        const UserModule = createModuleComponent<UserProps>((props) => ({ id: `user-${props.userId}` }))

        const ids: string[] = []
        let setProps: ((props: UserProps) => void) | null = null

        function Probe() {
            ids.push(useModuleContext().module.id)
            return null
        }

        function Harness() {
            const [props, setPropsState] = useState<UserProps>({ userId: "u1", name: "Ann" })
            setProps = setPropsState
            return (
                <Root>
                    <UserModule {...props}>
                        <Probe />
                    </UserModule>
                </Root>
            )
        }

        render(<Harness />)
        act(() => setProps?.({ userId: "u2", name: "Ann" }))

        expect(ids[0]).toBe("user-u1")
        expect(ids.at(-1)).toBe("user-u1")
    })

    it("re-runs on every render, always with the current props", () => {
        const seen: UserProps[] = []

        const UserModule = createModuleComponent<UserProps>((props) => {
            seen.push(props)
            return {}
        })

        let setProps: ((props: UserProps) => void) | null = null

        function Harness() {
            const [props, setPropsState] = useState<UserProps>({ userId: "u1", name: "Ann" })
            setProps = setPropsState
            return (
                <Root>
                    <UserModule {...props} />
                </Root>
            )
        }

        render(<Harness />)
        act(() => setProps?.({ userId: "u1", name: "Bob" }))

        expect(seen[0]).toEqual({ userId: "u1", name: "Ann" })
        expect(seen.at(-1)).toEqual({ userId: "u1", name: "Bob" })
    })
})

// Options: propsAdapter + propsToken
// ========================================

describe("createModuleComponent with { propsAdapter, propsToken }", () => {
    type Point = { x: number }
    type Boxed = { boxed: Point }

    const CUSTOM: InjectionToken<PropsRef<Boxed>> = Symbol.for("tests.createModuleComponent.custom")

    it("bridges through the adapter under the custom token", () => {
        const adapter: PropsAdapter<Point, Boxed> = {
            create: vi.fn((initial: Point) => ({ boxed: initial })),
            update: vi.fn(({ current, next }: { current: Boxed; next: Point }) => {
                current.boxed = next
                return current
            }),
        }

        const PointModule = createModuleComponent<Point, Boxed>({}, { propsAdapter: adapter, propsToken: CUSTOM })

        let boxed: PropsRef<Boxed> | undefined
        let byClass: PropsRef<unknown> | undefined
        let setPoint: ((point: Point) => void) | null = null

        function Probe() {
            boxed = useResolveOptional(CUSTOM)
            byClass = useResolveOptional(PropsRef)
            return null
        }

        function Harness() {
            const [point, setPointState] = useState<Point>({ x: 1 })
            setPoint = setPointState
            return (
                <Root>
                    <PointModule {...point}>
                        <Probe />
                    </PointModule>
                </Root>
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

// Under a parent module
// ========================================

describe("createModuleComponent under a parent", () => {
    it("keeps the bridge across a rebuild of a scoped module under a parent", () => {
        const UserModule = createModuleComponent<UserProps>((props) => ({ rebuildOn: [props.userId] }))

        const containers: Container[] = []
        let bridged: PropsRef<UserProps> | null = null
        let parent: Container | null = null
        let setProps: ((props: UserProps) => void) | null = null

        function Probe() {
            bridged = useResolve(PropsRef) as PropsRef<UserProps>
            containers.push(useContainer())
            return null
        }

        function ParentProbe() {
            parent = useContainer()
            return null
        }

        function Harness() {
            const [props, setPropsState] = useState<UserProps>({ userId: "u1", name: "Ann" })
            setProps = setPropsState
            return (
                <Root id="app">
                    <ParentProbe />
                    <UserModule {...props}>
                        <Probe />
                    </UserModule>
                </Root>
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
        expect(parent!.isRegistered(PropsRef, "self")).toBe(false)
        expect(containers.at(-1)!.isRegistered(PropsRef, "self")).toBe(true)
    })
})

// Clashing with the auto-bridge
// ========================================

describe("createModuleComponent and a hand-rolled bridge", () => {
    it("refuses a second provider on the same token", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {})

        const Clashing = createModuleComponent<UserProps>({
            providers: [{ provide: PropsRef, useValue: new PropsRef({ props: {} }) }],
        })

        expect(() =>
            render(
                <Root>
                    <Clashing userId="u1" name="Ann" />
                </Root>
            )
        ).toThrow(/already registered on this container/)

        spy.mockRestore()
    })
})

// No arguments
// ========================================

describe("createModuleComponent with no arguments", () => {
    it("still owns a scope and still bridges (empty) props", () => {
        const Scope = createModuleComponent()

        let bridged: PropsRef<object> | null = null
        let inner: string | null = null
        let outer: string | null = null

        function Probe() {
            bridged = useResolve(PropsRef) as PropsRef<object>
            inner = useModuleContext().module.id
            return null
        }

        function OuterProbe() {
            outer = useModuleContext().module.id
            return null
        }

        render(
            <Root id="app">
                <OuterProbe />
                <Scope>
                    <Probe />
                </Scope>
            </Root>
        )

        expect(outer).toBe("app")
        expect(inner).not.toBe("app")
        expect(bridged!.current).toEqual({})
    })

    it("is named Module for devtools", () => {
        const Scope = createModuleComponent()
        expect((Scope as { displayName?: string }).displayName).toBe("Module")
    })

    it("throws without an enclosing module, because it is scoped-only", () => {
        const Scope = createModuleComponent()
        const spy = vi.spyOn(console, "error").mockImplementation(() => {})

        expect(() => render(<Scope />)).toThrow(/ModuleProvider requires a parent module in context/)

        spy.mockRestore()
    })
})

// rebuildOn derived from props
// ========================================

describe("createModuleComponent rebuilding on a props-derived key", () => {
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

    // The module declares nothing props-related: `createModuleComponent` bridges, and the factory injects.
    const UserModule = createModuleComponent<UserProps>((props) => ({
        rebuildOn: [props.userId],
        providers: [
            { provide: UserService, useFactory: () => new UserService(inject<PropsRef<UserProps>>(PropsRef)) },
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
            <Root>
                <UserModule {...props}>
                    <Probe />
                </UserModule>
            </Root>
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
        const TOKEN: InjectionToken<PropsRef<Boxed>> = Symbol.for("tests.createModuleComponent.rebuild-adapter")

        const adapter: PropsAdapter<UserProps, Boxed> = {
            create: vi.fn((initial: UserProps) => ({ boxed: initial })),
            update: vi.fn(({ current, next }: { current: Boxed; next: UserProps }) => {
                current.boxed = next
                return current
            }),
        }

        const AdaptedModule = createModuleComponent<UserProps, Boxed>(
            (props) => ({ rebuildOn: [props.userId] }),
            { propsAdapter: adapter, propsToken: TOKEN }
        )

        let boxed: PropsRef<Boxed> | null = null
        const ids: string[] = []
        let setLocalProps: ((props: UserProps) => void) | null = null

        function AdaptedProbe() {
            boxed = useResolve(TOKEN)
            ids.push(useModuleContext().module.id)
            return null
        }

        function AdaptedHarness() {
            const [props, setPropsState] = useState<UserProps>({ userId: "u1", name: "Ann" })
            setLocalProps = setPropsState
            return (
                <Root>
                    <AdaptedModule {...props}>
                        <AdaptedProbe />
                    </AdaptedModule>
                </Root>
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

// Sibling boundaries with their own props tokens
// ========================================
//
// The D6 dogfood round concluded that sibling module components cannot each own a distinct props token,
// so both siblings' services would fight over the one `PropsRef` class token. They can, and the capability
// predates the rename — it was `{ token }`, inherited from `usePropsRefOptions` and never found. A
// `PropsRef` subclass is a distinct class and therefore a distinct injection token, exactly as `Ref`
// subclasses are for elements; `propsToken` is where a boundary names one.
//
// The subclass is a token, not a constructed type: the value registered under it is the plain `PropsRef`
// the hook made, so `instanceof` the subclass is false. Pinned below rather than glossed over.

describe("createModuleComponent with a PropsRef subclass as propsToken", () => {
    type LeftProps = { label: string }
    type RightProps = { count: number }
    type RightVM = { doubled: number }

    class LeftPropsRef extends PropsRef<LeftProps> {}
    class RightPropsRef extends PropsRef<RightProps> {}
    class RightVMRef extends PropsRef<RightVM> {}

    /** A child service that injects ONE token's bridge — what a real service inside a boundary looks like. */
    function readerOf<T>(token: InjectionToken<PropsRef<T>>) {
        const Service = class {
            readonly seen: T[] = []
            readonly props = inject(token)

            constructor() {
                this.props.onUpdate((next) => void this.seen.push(next))
            }
        }

        return Service
    }

    it("gives each sibling its own bridge under its own subclass token", () => {
        const LeftService = readerOf<LeftProps>(LeftPropsRef)
        const RightService = readerOf<RightProps>(RightPropsRef)

        const LeftModule = createModuleComponent<LeftProps>(
            { providers: [LeftService as unknown as Provider] },
            { propsToken: LeftPropsRef }
        )
        const RightModule = createModuleComponent<RightProps>(
            { providers: [RightService as unknown as Provider] },
            { propsToken: RightPropsRef }
        )

        let left: InstanceType<typeof LeftService> | null = null
        let right: InstanceType<typeof RightService> | null = null

        function LeftProbe() {
            left = useResolve(LeftService)
            return null
        }

        function RightProbe() {
            right = useResolve(RightService)
            return null
        }

        render(
            <Root id="app">
                <LeftModule label="ann">
                    <LeftProbe />
                </LeftModule>
                <RightModule count={7}>
                    <RightProbe />
                </RightModule>
            </Root>
        )

        expect(left!.props.current).toEqual({ label: "ann" })
        expect(right!.props.current).toEqual({ count: 7 })
        expect(left!.props).not.toBe(right!.props)
    })

    it("keeps each sibling's token out of the other's container and off the app", () => {
        const LeftModule = createModuleComponent<LeftProps>({}, { propsToken: LeftPropsRef })
        const RightModule = createModuleComponent<RightProps>({}, { propsToken: RightPropsRef })

        let inLeft: Record<string, unknown> = {}
        let inRight: Record<string, unknown> = {}
        let app: Container | null = null

        function LeftProbe() {
            inLeft = {
                own: useResolveOptional(LeftPropsRef),
                sibling: useResolveOptional(RightPropsRef),
                base: useResolveOptional(PropsRef),
            }
            return null
        }

        function RightProbe() {
            inRight = {
                own: useResolveOptional(RightPropsRef),
                sibling: useResolveOptional(LeftPropsRef),
                base: useResolveOptional(PropsRef),
            }
            return null
        }

        function AppProbe() {
            app = useContainer()
            return null
        }

        render(
            <Root id="app">
                <AppProbe />
                <LeftModule label="ann">
                    <LeftProbe />
                </LeftModule>
                <RightModule count={7}>
                    <RightProbe />
                </RightModule>
            </Root>
        )

        expect(inLeft.own).toBeInstanceOf(PropsRef)
        expect(inRight.own).toBeInstanceOf(PropsRef)

        // The subclass names the binding; it never constructs it.
        expect(inLeft.own).not.toBeInstanceOf(LeftPropsRef)

        // Neither sibling can reach the other's token, and a custom token leaves the class token unbound.
        expect(inLeft.sibling).toBeUndefined()
        expect(inRight.sibling).toBeUndefined()
        expect(inLeft.base).toBeUndefined()
        expect(inRight.base).toBeUndefined()

        expect(app!.isRegistered(LeftPropsRef, "self")).toBe(false)
        expect(app!.isRegistered(RightPropsRef, "self")).toBe(false)
    })

    it("delivers an update only to the sibling whose props changed", () => {
        const LeftService = readerOf<LeftProps>(LeftPropsRef)
        const RightService = readerOf<RightProps>(RightPropsRef)

        const LeftModule = createModuleComponent<LeftProps>(
            { providers: [LeftService as unknown as Provider] },
            { propsToken: LeftPropsRef }
        )
        const RightModule = createModuleComponent<RightProps>(
            { providers: [RightService as unknown as Provider] },
            { propsToken: RightPropsRef }
        )

        let left: InstanceType<typeof LeftService> | null = null
        let right: InstanceType<typeof RightService> | null = null
        let setLabel: ((label: string) => void) | null = null

        function LeftProbe() {
            left = useResolve(LeftService)
            return null
        }

        function RightProbe() {
            right = useResolve(RightService)
            return null
        }

        function Harness() {
            const [label, setLabelState] = useState("ann")
            setLabel = setLabelState
            return (
                <Root id="app">
                    <LeftModule label={label}>
                        <LeftProbe />
                    </LeftModule>
                    <RightModule count={7}>
                        <RightProbe />
                    </RightModule>
                </Root>
            )
        }

        render(<Harness />)
        act(() => setLabel?.("bob"))

        expect(left!.seen).toEqual([{ label: "bob" }])
        expect(right!.seen).toEqual([])
        expect(right!.props.current).toEqual({ count: 7 })
    })

    it("adapts through propsAdapter into a subclass propsToken", () => {
        const adapter: PropsAdapter<RightProps, RightVM> = {
            create: vi.fn((initial: RightProps) => ({ doubled: initial.count * 2 })),
            update: vi.fn(({ current, next }: { current: RightVM; next: RightProps }) => {
                current.doubled = next.count * 2
                return current
            }),
        }

        const VMService = readerOf<RightVM>(RightVMRef)
        const VMModule = createModuleComponent<RightProps, RightVM>(
            { providers: [VMService as unknown as Provider] },
            { propsAdapter: adapter, propsToken: RightVMRef }
        )

        let vm: InstanceType<typeof VMService> | null = null
        let setCount: ((count: number) => void) | null = null

        function Probe() {
            vm = useResolve(VMService)
            return null
        }

        function Harness() {
            const [count, setCountState] = useState(3)
            setCount = setCountState
            return (
                <Root id="app">
                    <VMModule count={count}>
                        <Probe />
                    </VMModule>
                </Root>
            )
        }

        render(<Harness />)

        expect(adapter.create).toHaveBeenCalledTimes(1)
        expect(vm!.props.current).toEqual({ doubled: 6 })

        const target = vi.mocked(adapter.create).mock.results[0]!.value
        act(() => setCount?.(5))

        expect(adapter.update).toHaveBeenCalledWith({ current: target, next: { count: 5 } })
        expect(vm!.props.current).toEqual({ doubled: 10 })
        expect(vm!.seen).toEqual([{ doubled: 10 }])
    })
})
