import { act, render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { Container } from "../../src/container/index.js"
import type { ModuleResolutionParams } from "../../src/core/module/resolution.types.js"
import { assertContainerIsFree, createModuleResolution } from "../../src/core/module/resolution.js"
import { ModuleMetadata } from "../../src/core/providers/module-metadata/module-metadata.provider.js"
import { ModuleProvider } from "../../src/react/providers/ModuleProvider.js"
import { useModuleContext } from "../../src/react/hooks/useModuleContext.js"

// One container = one module.
// ========================================
//
// A module owns exactly one container and a container is owned by exactly one module. `container` is not
// a module parameter (a compile error, pinned below), and a `factory` that hands back a container which
// already carries its own ModuleMetadata is rejected at runtime with one exact message.

const TAKEN_MESSAGE =
    'Container already belongs to module "feature:taken". ' +
    "One container = one module — give `factory` a fresh container, or drop `factory` to create a scoped child."

function messageOf(fn: () => unknown): string {
    try {
        fn()
    } catch (error) {
        return (error as Error).message
    }
    throw new Error("expected the call to throw, it did not")
}

describe("one container = one module — type surface", () => {
    it("rejects `container` as a module parameter", () => {
        const external = new Container()

        // Nothing here runs; `tsc -p tsconfig.test.json --noEmit` is the assertion. Each directive is
        // itself checked — if `container` ever becomes assignable again, TypeScript reports the
        // directive as unused and the typecheck fails.

        // @ts-expect-error `container` is not a module parameter — a module always owns its container.
        const asParams: ModuleResolutionParams = { container: external }
        void asParams

        // Not just an excess-property error on a fresh literal: it must also fail for a value that
        // already partially matches the (otherwise weak) scoped params type.
        // @ts-expect-error `container` is not a module parameter, `id` alongside it does not rescue it.
        const withKnownKey: ModuleResolutionParams = { id: "x", container: external }
        void withKnownKey

        // @ts-expect-error `<ModuleProvider container={...}>` must not typecheck.
        const element = <ModuleProvider container={external} />
        void element

        // @ts-expect-error the same through the JSX spread path.
        const spreadElement = <ModuleProvider {...{ container: external }} />
        void spreadElement

        expect(external).toBeInstanceOf(Container)
    })
})

describe("assertContainerIsFree", () => {
    it("passes a container that no module has claimed", () => {
        expect(() => assertContainerIsFree(new Container())).not.toThrow()
    })

    it("passes a container carrying unrelated bindings", () => {
        const container = new Container()
        container.register({ provide: "anything", useValue: 1 })

        expect(() => assertContainerIsFree(container)).not.toThrow()
    })

    it("throws with the exact message once a module owns the container", () => {
        const taken = createModuleResolution(null, { root: true, id: "feature:taken" })

        expect(messageOf(() => assertContainerIsFree(taken.container))).toBe(TAKEN_MESSAGE)
    })

    it("does not treat a parent's ModuleMetadata seen through the chain as a claim", () => {
        const parent = createModuleResolution(null, { root: true, id: "feature:parent" })
        const fork = parent.container.fork()

        // The fork resolves the parent's metadata recursively but owns none of it.
        expect(fork.resolve(ModuleMetadata).id).toBe("feature:parent")
        expect(fork.resolveSafe(ModuleMetadata, false)).toBeUndefined()
        expect(() => assertContainerIsFree(fork)).not.toThrow()
    })
})

describe("one container = one module — runtime guard", () => {
    it("throws when a factory hands back an existing module's container", () => {
        const taken = createModuleResolution(null, { root: true, id: "feature:taken" })

        expect(messageOf(() => createModuleResolution(null, { factory: () => taken.container }))).toBe(TAKEN_MESSAGE)
    })

    it("throws from React when a factory hands back an existing module's container", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {})
        const taken = createModuleResolution(null, { root: true, id: "feature:taken" })

        expect(() =>
            render(
                <ModuleProvider factory={() => taken.container}>
                    <div />
                </ModuleProvider>
            )
        ).toThrowError(new Error(TAKEN_MESSAGE))

        spy.mockRestore()
    })

    it("allows a scoped child of a module container — the chain hit is not a claim", () => {
        let childContainer: Container | null = null
        let childId: string | null = null

        function Probe() {
            const context = useModuleContext()
            childContainer = context.container
            childId = context.id
            return null
        }

        const view = render(
            <ModuleProvider root id="feature:parent">
                <ModuleProvider id="feature:child">
                    <Probe />
                </ModuleProvider>
            </ModuleProvider>
        )

        expect(childId).toBe("feature:child")
        expect(childContainer).toBeInstanceOf(Container)
        expect(childContainer!.resolve(ModuleMetadata).id).toBe("feature:child")

        view.unmount()
    })

    it("nests scoped modules arbitrarily deep without tripping the guard", () => {
        const ids: string[] = []

        function Probe() {
            ids.push(useModuleContext().id)
            return null
        }

        const view = render(
            <ModuleProvider root id="a">
                <Probe />
                <ModuleProvider id="b">
                    <Probe />
                    <ModuleProvider id="c">
                        <Probe />
                    </ModuleProvider>
                </ModuleProvider>
            </ModuleProvider>
        )

        expect(ids).toEqual(["a", "b", "c"])
        view.unmount()
    })

    it("throws on rebuild when the factory keeps returning one reused container", () => {
        // The new resolution is built while the outgoing one is still alive and still owns the
        // container, so a stable factory container is caught the moment a rebuild happens.
        const spy = vi.spyOn(console, "error").mockImplementation(() => {})
        const stable = new Container()
        let rebuildModule: (() => void) | null = null

        function Probe() {
            rebuildModule = useModuleContext().rebuild
            return null
        }

        render(
            <ModuleProvider factory={() => stable} id="feature:stable">
                <Probe />
            </ModuleProvider>
        )

        expect(() => {
            act(() => {
                rebuildModule?.()
            })
        }).toThrowError(/One container = one module/)

        spy.mockRestore()
    })

    it("survives a rebuild when the factory mints a fresh container each time", () => {
        const containers: Container[] = []
        let rebuildModule: (() => void) | null = null

        function Probe() {
            rebuildModule = useModuleContext().rebuild
            containers.push(useModuleContext().container)
            return null
        }

        render(
            <ModuleProvider
                factory={() => new Container()}
                id="feature:fresh"
            >
                <Probe />
            </ModuleProvider>
        )

        act(() => {
            rebuildModule?.()
        })

        expect(containers.length).toBeGreaterThanOrEqual(2)
        expect(containers.at(-1)).not.toBe(containers[0])
    })
})
