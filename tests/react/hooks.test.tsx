import { act, render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useState, type ReactNode } from "react"

import { Container, Injectable, Scope, decorate } from "../../src/container/index.js"
import { ModuleProvider } from "../../src/react/providers/ModuleProvider.js"
import { useContainer, useModuleContext, useModuleRebuild } from "../../src/react/hooks/useModuleContext.js"
import { useResolve, useResolveSafe } from "../../src/react/hooks/useResolve.js"
import { useResolveAll } from "../../src/react/hooks/useResolveAll.js"

// Resolution hooks
// ========================================

class Counter {
    static made = 0

    readonly seq = ++Counter.made
}
decorate(Injectable(), Counter)

const TRANSIENT_COUNTER = { provide: Counter, useClass: Counter, scope: Scope.Transient } as const

const SHARED = Symbol.for("tests.hooks.shared")
const MISSING = Symbol.for("tests.hooks.missing")
const THROWING = Symbol.for("tests.hooks.throwing")

function silenceReactErrorLog(): () => void {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    return () => spy.mockRestore()
}

beforeEach(() => {
    Counter.made = 0
})

describe("useResolve", () => {
    it("resolves a token from the module container", () => {
        let seen: Counter | null = null

        function Probe(): ReactNode {
            seen = useResolve(Counter)
            return null
        }

        render(
            <ModuleProvider root providers={[Counter]}>
                <Probe />
            </ModuleProvider>
        )

        expect(seen).toBeInstanceOf(Counter)
        expect(seen!.seq).toBe(1)
    })

    it("resolves through the chain from a scoped child", () => {
        let seen: string | null = null

        function Probe(): ReactNode {
            seen = useResolve<string>(SHARED)
            return null
        }

        render(
            <ModuleProvider root providers={[{ provide: SHARED, useValue: "from-root" }]}>
                <ModuleProvider>
                    <Probe />
                </ModuleProvider>
            </ModuleProvider>
        )

        expect(seen).toBe("from-root")
    })

    it("throws for an unregistered token", () => {
        const restore = silenceReactErrorLog()

        function Probe(): ReactNode {
            useResolve(MISSING)
            return null
        }

        expect(() =>
            render(
                <ModuleProvider root>
                    <Probe />
                </ModuleProvider>
            )
        ).toThrowError(new Error("Token tests.hooks.missing is not registered in this container or any ancestor."))

        restore()
    })

    it("throws with recursive=false when the token lives only in the parent", () => {
        const restore = silenceReactErrorLog()

        function Probe(): ReactNode {
            useResolve(SHARED, false)
            return null
        }

        expect(() =>
            render(
                <ModuleProvider root providers={[{ provide: SHARED, useValue: "from-root" }]}>
                    <ModuleProvider>
                        <Probe />
                    </ModuleProvider>
                </ModuleProvider>
            )
        ).toThrowError(
            new Error("Token tests.hooks.shared is not registered in this container (searched that container only).")
        )

        restore()
    })

    it("keeps one instance across re-renders", () => {
        const seen: Counter[] = []
        let bump: (() => void) | null = null

        function Probe(): ReactNode {
            seen.push(useResolve(Counter))
            return null
        }

        function Harness(): ReactNode {
            const [tick, setTick] = useState(0)
            bump = () => setTick((value) => value + 1)
            return (
                <ModuleProvider root providers={[TRANSIENT_COUNTER]}>
                    <Probe />
                    <span>{tick}</span>
                </ModuleProvider>
            )
        }

        render(<Harness />)
        act(() => bump?.())
        act(() => bump?.())

        // Transient scope would mint a fresh instance on every re-resolve; one instance across three
        // renders is what makes the snapshot observable.
        expect(seen.length).toBe(3)
        expect(new Set(seen).size).toBe(1)
        expect(Counter.made).toBe(1)
    })

    it("re-resolves when the container changes", () => {
        const seen: Counter[] = []
        let rebuild: (() => void) | null = null

        function Probe(): ReactNode {
            seen.push(useResolve(Counter))
            rebuild = useModuleRebuild()
            return null
        }

        render(
            <ModuleProvider root providers={[TRANSIENT_COUNTER]}>
                <Probe />
            </ModuleProvider>
        )

        expect(seen.at(-1)!.seq).toBe(1)

        act(() => rebuild?.())

        expect(seen.at(-1)!.seq).toBe(2)
        expect(seen.at(-1)).not.toBe(seen[0])
    })

    it("re-resolves when the token changes", () => {
        const seen: string[] = []
        let switchToken: (() => void) | null = null
        const A = Symbol.for("tests.hooks.a")
        const B = Symbol.for("tests.hooks.b")

        function Probe(): ReactNode {
            const [token, setToken] = useState<symbol>(A)
            switchToken = () => setToken(B)
            seen.push(useResolve<string>(token))
            return null
        }

        render(
            <ModuleProvider
                root
                providers={[
                    { provide: A, useValue: "a" },
                    { provide: B, useValue: "b" },
                ]}
            >
                <Probe />
            </ModuleProvider>
        )

        expect(seen).toEqual(["a"])
        act(() => switchToken?.())
        expect(seen).toEqual(["a", "b"])
    })
})

describe("useResolveSafe", () => {
    it("returns undefined for a missing token instead of throwing", () => {
        let seen: unknown = "sentinel"

        function Probe(): ReactNode {
            seen = useResolveSafe(MISSING)
            return null
        }

        render(
            <ModuleProvider root>
                <Probe />
            </ModuleProvider>
        )

        expect(seen).toBeUndefined()
    })

    it("returns undefined with recursive=false for a parent-only token", () => {
        const seen: unknown[] = []
        let flip: (() => void) | null = null

        function Probe(): ReactNode {
            const [recursive, setRecursive] = useState(true)
            flip = () => setRecursive(false)
            seen.push(useResolveSafe<string>(SHARED, recursive))
            return null
        }

        render(
            <ModuleProvider root providers={[{ provide: SHARED, useValue: "from-root" }]}>
                <ModuleProvider>
                    <Probe />
                </ModuleProvider>
            </ModuleProvider>
        )

        expect(seen).toEqual(["from-root"])

        act(() => flip?.())
        expect(seen).toEqual(["from-root", undefined])
    })

    it("still surfaces an error thrown while constructing a registered token", () => {
        const restore = silenceReactErrorLog()

        function Probe(): ReactNode {
            useResolveSafe(THROWING)
            return null
        }

        expect(() =>
            render(
                <ModuleProvider
                    root
                    providers={[
                        {
                            provide: THROWING,
                            lazy: true,
                            useFactory: () => {
                                throw new Error("factory failed")
                            },
                        },
                    ]}
                >
                    <Probe />
                </ModuleProvider>
            )
        ).toThrowError(new Error("factory failed"))

        restore()
    })

    it("keeps a stable snapshot across re-renders", () => {
        const seen: Array<Counter | undefined> = []
        const missing: unknown[] = []
        let bump: (() => void) | null = null

        function Probe(): ReactNode {
            seen.push(useResolveSafe(Counter))
            missing.push(useResolveSafe(MISSING))
            return null
        }

        function Harness(): ReactNode {
            const [tick, setTick] = useState(0)
            bump = () => setTick((value) => value + 1)
            return (
                <ModuleProvider root providers={[TRANSIENT_COUNTER]}>
                    <Probe />
                    <span>{tick}</span>
                </ModuleProvider>
            )
        }

        render(<Harness />)
        act(() => bump?.())

        expect(new Set(seen).size).toBe(1)
        expect(missing).toEqual([undefined, undefined])
        expect(Counter.made).toBe(1)
    })
})

describe("useResolveAll", () => {
    it("collects the chain, nearest module first", () => {
        let seen: string[] = []

        function Probe(): ReactNode {
            seen = useResolveAll<string>(SHARED)
            return null
        }

        render(
            <ModuleProvider root providers={[{ provide: SHARED, useValue: "root" }]}>
                <ModuleProvider providers={[{ provide: SHARED, useValue: "child" }]}>
                    <ModuleProvider providers={[{ provide: SHARED, useValue: "grandchild" }]}>
                        <Probe />
                    </ModuleProvider>
                </ModuleProvider>
            </ModuleProvider>
        )

        expect(seen).toEqual(["grandchild", "child", "root"])
    })

    it("returns an empty array for a token nobody registered", () => {
        let seen: unknown[] = ["sentinel"]

        function Probe(): ReactNode {
            seen = useResolveAll(MISSING)
            return null
        }

        render(
            <ModuleProvider root>
                <Probe />
            </ModuleProvider>
        )

        expect(seen).toEqual([])
    })

    it("keeps the same array across re-renders and swaps it when the container changes", () => {
        const seen: string[][] = []
        let bump: (() => void) | null = null
        let rebuild: (() => void) | null = null

        function Probe(): ReactNode {
            seen.push(useResolveAll<string>(SHARED))
            rebuild = useModuleRebuild()
            return null
        }

        function Harness(): ReactNode {
            const [tick, setTick] = useState(0)
            bump = () => setTick((value) => value + 1)
            return (
                <ModuleProvider root providers={[{ provide: SHARED, useValue: "root" }]}>
                    <Probe />
                    <span>{tick}</span>
                </ModuleProvider>
            )
        }

        render(<Harness />)
        act(() => bump?.())

        expect(seen.length).toBe(2)
        expect(seen[0]).toBe(seen[1])

        act(() => rebuild?.())

        expect(seen.at(-1)).not.toBe(seen[0])
        expect(seen.at(-1)).toEqual(["root"])
    })
})

describe("useModuleContext, useContainer, useModuleRebuild", () => {
    it("all read the same context value", () => {
        let context: ReturnType<typeof useModuleContext> | null = null
        let container: Container | null = null
        let rebuild: (() => void) | null = null

        function Probe(): ReactNode {
            context = useModuleContext()
            container = useContainer()
            rebuild = useModuleRebuild()
            return null
        }

        render(
            <ModuleProvider root id="same">
                <Probe />
            </ModuleProvider>
        )

        expect(container).toBe(context!.container)
        expect(rebuild).toBe(context!.rebuild)
        expect(container).toBeInstanceOf(Container)
    })

    it("keeps the rebuild function identity stable across re-renders", () => {
        const seen: Array<() => void> = []
        let bump: (() => void) | null = null

        function Probe(): ReactNode {
            seen.push(useModuleRebuild())
            return null
        }

        function Harness(): ReactNode {
            const [tick, setTick] = useState(0)
            bump = () => setTick((value) => value + 1)
            return (
                <ModuleProvider root>
                    <Probe />
                    <span>{tick}</span>
                </ModuleProvider>
            )
        }

        render(<Harness />)
        act(() => bump?.())

        expect(seen.length).toBe(2)
        expect(new Set(seen).size).toBe(1)
    })

    it("throws outside a ModuleProvider", () => {
        const restore = silenceReactErrorLog()
        const message = new Error("useModuleContext: no module in context. Wrap with <ModuleProvider>.")

        function Context(): ReactNode {
            useModuleContext()
            return null
        }
        function UseContainer(): ReactNode {
            useContainer()
            return null
        }
        function UseRebuild(): ReactNode {
            useModuleRebuild()
            return null
        }

        expect(() => render(<Context />)).toThrowError(message)
        expect(() => render(<UseContainer />)).toThrowError(message)
        expect(() => render(<UseRebuild />)).toThrowError(message)

        restore()
    })

    it("throws from useResolve outside a ModuleProvider, through useContainer", () => {
        const restore = silenceReactErrorLog()

        function Probe(): ReactNode {
            useResolve(MISSING)
            return null
        }

        expect(() => render(<Probe />)).toThrowError(
            new Error("useModuleContext: no module in context. Wrap with <ModuleProvider>.")
        )

        restore()
    })
})
