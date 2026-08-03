import { render } from "@testing-library/react"
import { act } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useState } from "react"

import { createModuleComponent } from "../../src/react/factories/createModuleComponent.js"
import { ModuleProvider } from "../../src/react/providers/ModuleProvider.js"
import { PropsRef, type PropsAdapter } from "../../src/core/providers/props-ref/props-ref.provider.js"
import { Inject, Injectable, Optional, decorate } from "../../src/container/decorators.js"
import { useResolve } from "../../src/react/hooks/useResolve.js"
import type { InjectionToken, Provider } from "../../src/container/index.js"
import { Root } from "../setup/react.js"

// The documented consumer shape: a service takes the bridge through its constructor. vitest transforms
// with esbuild and emits no `design:paramtypes`, so the decorators go on through `decorate()` and each
// constructor parameter needs its own explicit `Inject(TOKEN)`.

type UserProps = { userId: string; name: string }

function injectingService(token: InjectionToken<unknown> = PropsRef) {
    const Service = class {
        readonly seen: unknown[] = []

        constructor(readonly props: PropsRef<UserProps>) {
            props.onUpdate((next) => void this.seen.push(next))
        }
    }

    decorate(Injectable(), Service)
    decorate(Inject(token), Service, 0)

    return Service
}

// Constructor injection
// ========================================

describe("PropsRef through constructor injection", () => {
    it("hands a service the component-owned bridge under the class token", () => {
        const Service = injectingService()
        const UserModule = createModuleComponent<UserProps>({ providers: [Service as unknown as Provider] })

        let resolved: InstanceType<typeof Service> | null = null
        let setProps: ((props: UserProps) => void) | null = null

        function Probe() {
            resolved = useResolve(Service)
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

        expect(resolved!.props).toBeInstanceOf(PropsRef)
        expect(resolved!.props.current).toEqual({ userId: "u1", name: "Ann" })

        act(() => setProps?.({ userId: "u1", name: "Bob" }))

        expect(resolved!.props.current).toEqual({ userId: "u1", name: "Bob" })
        expect(resolved!.seen).toEqual([{ userId: "u1", name: "Bob" }])
    })

    it("hands it the adapted value under a custom token", () => {
        type Boxed = { boxed: UserProps }
        const TOKEN: InjectionToken<PropsRef<Boxed>> = Symbol.for("tests.props.injection.custom")

        const adapter: PropsAdapter<UserProps, Boxed> = {
            create: (initial) => ({ boxed: initial }),
            update: ({ current, next }) => {
                current.boxed = next
                return current
            },
        }

        const Service = injectingService(TOKEN)
        const UserModule = createModuleComponent<UserProps, Boxed>(
            { providers: [Service as unknown as Provider] },
            { propsAdapter: adapter, propsToken: TOKEN }
        )

        let resolved: InstanceType<typeof Service> | null = null

        function Probe() {
            resolved = useResolve(Service)
            return null
        }

        render(
            <Root>
                <UserModule userId="u1" name="Ann">
                    <Probe />
                </UserModule>
            </Root>
        )

        expect(resolved!.props.current).toEqual({ boxed: { userId: "u1", name: "Ann" } })
    })

    it("resolves an ancestor's bridge from a nested module that has none of its own", () => {
        const Service = injectingService()
        const UserModule = createModuleComponent<UserProps>()

        let resolved: InstanceType<typeof Service> | null = null

        function Probe() {
            resolved = useResolve(Service)
            return null
        }

        render(
            <Root>
                <UserModule userId="u1" name="Ann">
                    <ModuleProvider providers={[Service as unknown as Provider]}>
                        <Probe />
                    </ModuleProvider>
                </UserModule>
            </Root>
        )

        expect(resolved!.props.current).toEqual({ userId: "u1", name: "Ann" })
    })

    it("is undefined, not an error, when the module has no bridge and the dependency is optional", () => {
        const Service = class {
            constructor(readonly props: PropsRef<UserProps> | undefined) {}
        }
        decorate(Injectable(), Service)
        decorate(Inject(PropsRef), Service, 0)
        decorate(Optional(), Service, 0)

        let resolved: InstanceType<typeof Service> | null = null

        function Probe() {
            resolved = useResolve(Service)
            return null
        }

        render(
            <Root>
                <ModuleProvider providers={[Service as unknown as Provider]}>
                    <Probe />
                </ModuleProvider>
            </Root>
        )

        expect(resolved!.props).toBeUndefined()
    })
})

// One bridge per mounted component
// ========================================

describe("PropsRef is component-owned", () => {
    it("gives two sibling mounts of the same module separate bridges", () => {
        const UserModule = createModuleComponent<UserProps>()

        const refs: PropsRef<UserProps>[] = []

        function Probe() {
            refs.push(useResolve(PropsRef) as PropsRef<UserProps>)
            return null
        }

        render(
            <Root>
                <UserModule userId="u1" name="Ann">
                    <Probe />
                </UserModule>
                <UserModule userId="u2" name="Bob">
                    <Probe />
                </UserModule>
            </Root>
        )

        expect(refs).toHaveLength(2)
        expect(refs[0]).not.toBe(refs[1])
        expect(refs[0]!.current).toEqual({ userId: "u1", name: "Ann" })
        expect(refs[1]!.current).toEqual({ userId: "u2", name: "Bob" })
    })

    it("drops the bridge with the component that owned it", () => {
        const UserModule = createModuleComponent<UserProps>()

        const refs: PropsRef<UserProps>[] = []

        function Probe() {
            refs.push(useResolve(PropsRef) as PropsRef<UserProps>)
            return null
        }

        function Harness({ show }: { show: boolean }) {
            return (
                <Root>
                    {show ? (
                        <UserModule userId="u1" name="Ann">
                            <Probe />
                        </UserModule>
                    ) : null}
                </Root>
            )
        }

        const { rerender } = render(<Harness show />)
        const first = refs[0]

        rerender(<Harness show={false} />)
        rerender(<Harness show />)

        expect(refs).toHaveLength(2)
        expect(refs[1]).not.toBe(first)
    })
})
