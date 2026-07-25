import { act, render } from "@testing-library/react"
import React from "react"
import { describe, expect, it } from "vitest"

import { Container, type DependencyContainer } from "../../src/aliases/index.js"
import type { ModuleResolutionParams } from "../../src/core/module/resolution.types.js"
import { ModuleProvider } from "../../src/react/providers/ModuleProvider"
import { useModuleContext } from "../../src/react/hooks/useModuleContext"
import { createModuleResolution } from "../../src/core/module/resolution.js"
import { ModuleLifecycle } from "../../src/core/providers/module-lifecycle/module-lifecycle.provider.js"

// One container = one module.
// ========================================
//
// A module owns exactly one container and a container is owned by exactly one module. There is no way
// to point a module at somebody else's container: `container` is not a parameter (compile error, pinned
// below and again in tests/consumers/*/src/repro.tsx against the published .d.ts), and a `factory` that
// hands back a container which already carries its own ModuleMetadata is rejected at runtime.

const EXACT_GUARD_MESSAGE =
    'Container already belongs to module "feature:taken". ' +
    "One container = one module — give `factory` a fresh container, or drop `factory` to create a scoped child."

describe("one container = one module — type surface", () => {
    it("rejects `container` as a module parameter", () => {
        const external = Container.createChildContainer()

        // Nothing here runs; `tsc -p tsconfig.test.json --noEmit` is the assertion. Each directive is
        // itself checked — if `container` ever becomes assignable again, TypeScript reports the
        // directive as unused and `npm run typecheck:tests` fails.

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

        expect(external).toBeTruthy()
    })
})

describe("one container = one module — runtime guard", () => {
    it("throws with the exact message when a factory hands back an existing module's container", () => {
        const taken = createModuleResolution(null, { root: true, id: "feature:taken" })
        taken.container.resolve(ModuleLifecycle).init()

        expect(() => createModuleResolution(null, { factory: () => taken.container })).toThrowError(
            EXACT_GUARD_MESSAGE
        )
    })

    it("throws from React when a factory hands back an existing module's container", () => {
        const taken = createModuleResolution(null, { root: true, id: "feature:taken" })
        taken.container.resolve(ModuleLifecycle).init()

        expect(() =>
            render(
                <ModuleProvider factory={() => taken.container}>
                    <div />
                </ModuleProvider>
            )
        ).toThrowError(EXACT_GUARD_MESSAGE)
    })

    it("allows a scoped child of a module container (the chain hit is not a claim)", () => {
        let childContainer: DependencyContainer | null = null
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
        expect(childContainer).toBeTruthy()

        view.unmount()
    })

    // Behaviour change, deliberate: a factory that reuses one container is the removed "point a module
    // at somebody else's container" mode wearing a hat, and the guard catches it on rebuild.
    // initializeModuleResolution runs synchronously during render, so the new resolution is built while
    // the outgoing one's teardown is still queued as a microtask and its container is still alive.
    it("throws on rebuild when the factory returns a stable, reused container", () => {
        const stable = Container.createChildContainer()
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
    })
})
