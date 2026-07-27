import { act, render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useState, type ReactNode } from "react"

import { Container } from "../../src/container/index.js"
import { ModuleMetadata } from "../../src/core/providers/module-metadata/module-metadata.provider.js"
import { ModuleRegistry } from "../../src/core/providers/module-registry/module-registry.provider.js"
import { ModuleProvider } from "../../src/react/providers/ModuleProvider.js"
import { useModule } from "../../src/react/hooks/useModule.js"
import { useModuleContext } from "../../src/react/hooks/useModuleContext.js"
import type { ModuleContextValue } from "../../src/react/context/ModuleContext.js"

// ModuleProvider + useModule
// ========================================

const SHARED = Symbol.for("tests.provider.shared")
const ROOT_ONLY = Symbol.for("tests.provider.root-only")

function silenceReactErrorLog(): () => void {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    return () => spy.mockRestore()
}

describe("ModuleProvider — context value", () => {
    it("publishes exactly { container, id, rebuild }", () => {
        let value: ModuleContextValue | null = null

        function Probe(): ReactNode {
            value = useModuleContext()
            return null
        }

        render(
            <ModuleProvider root id="shape">
                <Probe />
            </ModuleProvider>
        )

        expect(Object.keys(value!).sort()).toEqual(["container", "id", "rebuild"])
        expect(value!.container).toBeInstanceOf(Container)
        expect(value!.id).toBe("shape")
        expect(typeof value!.rebuild).toBe("function")
    })

    it("hands out the module's own container", () => {
        let value: ModuleContextValue | null = null

        function Probe(): ReactNode {
            value = useModuleContext()
            return null
        }

        render(
            <ModuleProvider root id="own">
                <Probe />
            </ModuleProvider>
        )

        expect(value!.container.resolve(ModuleMetadata).container).toBe(value!.container)
        expect(value!.container.resolve(ModuleMetadata).id).toBe("own")
    })

    it("generates an id when none is given", () => {
        let id = ""

        function Probe(): ReactNode {
            id = useModuleContext().id
            return null
        }

        render(
            <ModuleProvider root>
                <Probe />
            </ModuleProvider>
        )

        expect(id).toMatch(/^id:\d+$/)
    })

    it("keeps the same context object across unrelated re-renders", () => {
        const seen: ModuleContextValue[] = []
        let bump: (() => void) | null = null

        function Probe(): ReactNode {
            seen.push(useModuleContext())
            return null
        }

        function Harness(): ReactNode {
            const [tick, setTick] = useState(0)
            bump = () => setTick((value) => value + 1)
            return (
                <ModuleProvider root id="stable">
                    <Probe />
                    <span data-testid="tick">{tick}</span>
                </ModuleProvider>
            )
        }

        render(<Harness />)
        act(() => bump?.())
        act(() => bump?.())

        expect(seen.length).toBe(3)
        expect(new Set(seen).size).toBe(1)
    })

    it("renders its children", () => {
        const { container } = render(
            <ModuleProvider root>
                <span data-testid="child">hello</span>
            </ModuleProvider>
        )

        expect(container.textContent).toBe("hello")
    })

    it("accepts no children at all", () => {
        expect(() => render(<ModuleProvider root />)).not.toThrow()
    })
})

describe("ModuleProvider — nesting", () => {
    it("gives a scoped child its own container that reads through to the parent", () => {
        let parent: Container | null = null
        let child: Container | null = null

        function Parent(): ReactNode {
            parent = useModuleContext().container
            return null
        }
        function Child(): ReactNode {
            child = useModuleContext().container
            return null
        }

        render(
            <ModuleProvider root providers={[{ provide: ROOT_ONLY, useValue: "root-only" }]}>
                <Parent />
                <ModuleProvider providers={[{ provide: SHARED, useValue: "child" }]}>
                    <Child />
                </ModuleProvider>
            </ModuleProvider>
        )

        expect(child).not.toBe(parent)
        expect(child!.resolve(ROOT_ONLY)).toBe("root-only")
        expect(child!.isRegistered(ROOT_ONLY, false)).toBe(false)
        expect(parent!.isRegistered(SHARED)).toBe(false)
    })

    it("resolves the nearest override across root, child and grandchild", () => {
        const seen: string[] = []

        function Probe(): ReactNode {
            seen.push(useModuleContext().container.resolve<string>(SHARED))
            return null
        }

        render(
            <ModuleProvider root providers={[{ provide: SHARED, useValue: "root" }]}>
                <Probe />
                <ModuleProvider providers={[{ provide: SHARED, useValue: "child" }]}>
                    <Probe />
                    <ModuleProvider providers={[{ provide: SHARED, useValue: "grandchild" }]}>
                        <Probe />
                    </ModuleProvider>
                </ModuleProvider>
            </ModuleProvider>
        )

        expect(seen).toEqual(["root", "child", "grandchild"])
    })

    it("links the module tree through the registry as it mounts", () => {
        let root: Container | null = null
        let child: Container | null = null
        let grandchild: Container | null = null

        const capture = (assign: (container: Container) => void) =>
            function Probe(): ReactNode {
                assign(useModuleContext().container)
                return null
            }

        const Root = capture((container) => (root = container))
        const Child = capture((container) => (child = container))
        const Grandchild = capture((container) => (grandchild = container))

        render(
            <ModuleProvider root id="root">
                <Root />
                <ModuleProvider id="child">
                    <Child />
                    <ModuleProvider id="grandchild">
                        <Grandchild />
                    </ModuleProvider>
                </ModuleProvider>
            </ModuleProvider>
        )

        expect(root!.resolve(ModuleRegistry).descendants()).toEqual([child, grandchild])
        expect(grandchild!.resolve(ModuleRegistry).ancestors()).toEqual([child, root])
        expect(grandchild!.resolve(ModuleRegistry).findRoot()).toBe(root)
    })
})

describe("ModuleProvider — a parent that is not a module", () => {
    it("builds a root module with no module in context", () => {
        let value: ModuleContextValue | null = null

        function Probe(): ReactNode {
            value = useModuleContext()
            return null
        }

        render(
            <ModuleProvider root id="top">
                <Probe />
            </ModuleProvider>
        )

        expect(value!.container.resolve(ModuleMetadata).parent).toBeNull()
        expect(value!.container.resolve(ModuleRegistry).parent()).toBeNull()
        expect(value!.container.resolve(ModuleRegistry).findRoot()).toBe(value!.container)
    })

    it("throws for a scoped module with no module in context", () => {
        const restore = silenceReactErrorLog()

        expect(() =>
            render(
                <ModuleProvider>
                    <div />
                </ModuleProvider>
            )
        ).toThrowError(new Error("No parent container in context. Provide `root` or `factory` for a root module."))

        restore()
    })

    it("keeps a nested root module isolated from the surrounding module's bindings", () => {
        let outer: Container | null = null
        let inner: Container | null = null

        function Outer(): ReactNode {
            outer = useModuleContext().container
            return null
        }
        function Inner(): ReactNode {
            inner = useModuleContext().container
            return null
        }

        render(
            <ModuleProvider root id="outer" providers={[{ provide: ROOT_ONLY, useValue: "outer" }]}>
                <Outer />
                <div>
                    <ModuleProvider root id="inner">
                        <Inner />
                    </ModuleProvider>
                </div>
            </ModuleProvider>
        )

        // Fresh container, so none of the outer bindings reach it...
        expect(inner!.isRegistered(ROOT_ONLY)).toBe(false)
        // ...and it heads its own lifecycle tree: the outer module cannot claim or tear it down.
        expect(inner!.resolve(ModuleRegistry).parent()).toBeNull()
        expect(inner!.resolve(ModuleRegistry).findRoot()).toBe(inner)
        expect(outer!.resolve(ModuleRegistry).children()).toEqual([])
    })

    it("keeps a nested factory module isolated too", () => {
        let inner: Container | null = null

        function Inner(): ReactNode {
            inner = useModuleContext().container
            return null
        }

        const supplied = new Container()
        supplied.register({ provide: SHARED, useValue: "supplied" })

        render(
            <ModuleProvider root providers={[{ provide: ROOT_ONLY, useValue: "outer" }]}>
                <ModuleProvider factory={() => supplied} id="inner">
                    <Inner />
                </ModuleProvider>
            </ModuleProvider>
        )

        expect(inner).toBe(supplied)
        expect(inner!.resolve(SHARED)).toBe("supplied")
        expect(inner!.isRegistered(ROOT_ONLY)).toBe(false)
    })
})

describe("useModule", () => {
    it("returns the value ModuleProvider publishes", () => {
        let fromHook: ModuleContextValue | null = null

        function Standalone(): ReactNode {
            fromHook = useModule({ root: true, id: "hooked" })
            return null
        }

        render(<Standalone />)

        expect(Object.keys(fromHook!).sort()).toEqual(["container", "id", "rebuild"])
        expect(fromHook!.id).toBe("hooked")
        expect(fromHook!.container).toBeInstanceOf(Container)
    })

    it("reads the surrounding module as its parent without a ModuleProvider of its own", () => {
        let scoped: ModuleContextValue | null = null

        function Scoped(): ReactNode {
            scoped = useModule({ id: "scoped" })
            return null
        }

        render(
            <ModuleProvider root id="outer" providers={[{ provide: ROOT_ONLY, useValue: "outer" }]}>
                <Scoped />
            </ModuleProvider>
        )

        expect(scoped!.id).toBe("scoped")
        expect(scoped!.container.resolve(ROOT_ONLY)).toBe("outer")
        expect(scoped!.container.isRegistered(ROOT_ONLY, false)).toBe(false)
    })
})
