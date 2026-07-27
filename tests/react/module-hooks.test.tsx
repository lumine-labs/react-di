import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"

import type { Container } from "../../src/container/index.js"
import type { ModulePhase } from "../../src/core/providers/module-lifecycle/module-lifecycle.types.js"
import { ModuleProvider } from "../../src/react/providers/ModuleProvider.js"
import { useModuleContext } from "../../src/react/hooks/useModuleContext.js"
import { flush, tracked } from "../setup/helpers.js"

// Module hooks through props
// ========================================
//
// The hook props are bridged with `useEvent`, so the module always calls the latest render's function
// without rebuilding when an inline arrow changes identity. `onModuleError` is the exception: its
// *presence* at resolution time decides whether a failing phase throws or is handed to the handler.

type Failure = [ModulePhase, string]

function collectErrors(sink: Failure[]) {
    return (phase: ModulePhase, error: unknown) => sink.push([phase, (error as Error).message])
}

describe("module hooks reach the lifecycle", () => {
    it("fires all four in order, with no providers involved", async () => {
        const log: string[] = []

        const { unmount } = render(
            <ModuleProvider
                root
                onModuleInit={() => log.push("init")}
                onModuleMount={() => log.push("mount")}
                onModuleUnmount={() => log.push("unmount")}
                onModuleDestroy={() => log.push("destroy")}
            >
                <div />
            </ModuleProvider>
        )

        expect(log).toEqual(["init", "mount"])

        unmount()
        await flush()

        expect(log).toEqual(["init", "mount", "unmount", "destroy"])
    })

    it("hands each hook the module's own container", async () => {
        const seen: Container[] = []
        let contextContainer: Container | null = null

        function Probe(): ReactNode {
            contextContainer = useModuleContext().container
            return null
        }

        const record = (container: Container) => seen.push(container)

        const { unmount } = render(
            <ModuleProvider
                root
                onModuleInit={record}
                onModuleMount={record}
                onModuleUnmount={record}
                onModuleDestroy={record}
            >
                <Probe />
            </ModuleProvider>
        )

        unmount()
        await flush()

        expect(seen.length).toBe(4)
        expect(new Set(seen).size).toBe(1)
        expect(seen[0]).toBe(contextContainer)
    })

    it("calls the latest render's function, not the one the module was built with", async () => {
        const log: string[] = []

        function Tree({ tag }: { tag: string }): ReactNode {
            return (
                <ModuleProvider
                    root
                    onModuleMount={() => log.push(`mount:${tag}`)}
                    onModuleUnmount={() => log.push(`unmount:${tag}`)}
                    onModuleDestroy={() => log.push(`destroy:${tag}`)}
                >
                    <div />
                </ModuleProvider>
            )
        }

        const { rerender, unmount } = render(<Tree tag="a" />)
        expect(log).toEqual(["mount:a"])

        rerender(<Tree tag="b" />)
        rerender(<Tree tag="c" />)

        unmount()
        await flush()

        expect(log).toEqual(["mount:a", "unmount:c", "destroy:c"])
    })

    it("does not rebuild just because the inline hook props are new functions", async () => {
        const log: string[] = []
        const Service = tracked(log, "S")

        function Tree({ tag }: { tag: string }): ReactNode {
            return (
                <ModuleProvider root providers={[Service]} onModuleInit={() => log.push(`init:${tag}`)}>
                    <div />
                </ModuleProvider>
            )
        }

        const { rerender } = render(<Tree tag="a" />)
        log.length = 0

        rerender(<Tree tag="b" />)
        rerender(<Tree tag="c" />)
        await flush()

        expect(log).toEqual([])
        expect(Service.counts).toEqual({ init: 1, mount: 1, unmount: 0, destroy: 0 })
    })
})

describe("onModuleError", () => {
    it("takes ownership of an init failure and lets the module carry on to mount", () => {
        const log: string[] = []
        const errors: Failure[] = []
        const Bad = tracked(log, "Bad", { throwOn: "init" })
        const Good = tracked(log, "Good")

        render(
            <ModuleProvider root providers={[Bad, Good]} onModuleError={collectErrors(errors)}>
                <div />
            </ModuleProvider>
        )

        expect(errors).toEqual([["init", "Bad init"]])
        // The init phase is one try for the whole module, so `Good` never inits — but both still mount.
        expect(log).toEqual(["Bad:ctor", "Good:ctor", "Bad:mount", "Good:mount"])
        expect(Bad.counts).toEqual({ init: 0, mount: 1, unmount: 0, destroy: 0 })
        expect(Good.counts).toEqual({ init: 0, mount: 1, unmount: 0, destroy: 0 })
    })

    it("takes ownership of a mount failure and keeps mounting the rest", () => {
        const log: string[] = []
        const errors: Failure[] = []
        const Bad = tracked(log, "Bad", { throwOn: "mount" })
        const Good = tracked(log, "Good")

        render(
            <ModuleProvider root providers={[Bad, Good]} onModuleError={collectErrors(errors)}>
                <div />
            </ModuleProvider>
        )

        expect(errors).toEqual([["mount", "Bad mount"]])
        // Every participating provider is constructed first, then the phases run over the instances.
        expect(log).toEqual(["Bad:ctor", "Good:ctor", "Bad:init", "Good:init", "Good:mount"])
        expect(Good.counts).toEqual({ init: 1, mount: 1, unmount: 0, destroy: 0 })
    })

    it("takes ownership of unmount and destroy failures, in reverse order", async () => {
        const log: string[] = []
        const errors: Failure[] = []
        const Bad = tracked(log, "Bad", { throwOn: "unmount" })
        const Worse = tracked(log, "Worse", { throwOn: "destroy" })

        const { unmount } = render(
            <ModuleProvider root providers={[Bad, Worse]} onModuleError={collectErrors(errors)}>
                <div />
            </ModuleProvider>
        )
        log.length = 0

        unmount()
        await flush()

        // Teardown walks the instances in reverse, so `Worse` is heard from first in both phases.
        expect(errors).toEqual([
            ["unmount", "Bad unmount"],
            ["destroy", "Worse destroy"],
        ])
        expect(log).toEqual(["Worse:unmount", "Bad:destroy"])
        expect(Bad.counts).toEqual({ init: 1, mount: 1, unmount: 0, destroy: 1 })
        expect(Worse.counts).toEqual({ init: 1, mount: 1, unmount: 1, destroy: 0 })
    })

    it("takes ownership of a failing module hook of its own", async () => {
        const errors: Failure[] = []

        const { unmount } = render(
            <ModuleProvider
                root
                onModuleInit={() => {
                    throw new Error("module init boom")
                }}
                onModuleUnmount={() => {
                    throw new Error("module unmount boom")
                }}
                onModuleError={collectErrors(errors)}
            >
                <div />
            </ModuleProvider>
        )

        expect(errors).toEqual([["init", "module init boom"]])

        unmount()
        await flush()

        expect(errors).toEqual([
            ["init", "module init boom"],
            ["unmount", "module unmount boom"],
        ])
    })

    it("reports each failure independently rather than stopping at the first", async () => {
        const errors: Failure[] = []
        const log: string[] = []
        const A = tracked(log, "A", { throwOn: "unmount" })
        const B = tracked(log, "B", { throwOn: "unmount" })

        const { unmount } = render(
            <ModuleProvider root providers={[A, B]} onModuleError={collectErrors(errors)}>
                <div />
            </ModuleProvider>
        )

        unmount()
        await flush()

        expect(errors.filter(([phase]) => phase === "unmount")).toEqual([
            ["unmount", "B unmount"],
            ["unmount", "A unmount"],
        ])
    })

    it("uses the latest render's handler", async () => {
        const errors: Failure[] = []
        const log: string[] = []
        const Bad = tracked(log, "Bad", { throwOn: "unmount" })

        function Tree({ tag }: { tag: string }): ReactNode {
            return (
                <ModuleProvider
                    root
                    providers={[Bad]}
                    onModuleError={(phase, error) => errors.push([phase, `${tag}:${(error as Error).message}`])}
                >
                    <div />
                </ModuleProvider>
            )
        }

        const { rerender, unmount } = render(<Tree tag="first" />)
        rerender(<Tree tag="second" />)

        unmount()
        await flush()

        expect(errors).toEqual([["unmount", "second:Bad unmount"]])
    })

    it("is absent unless the prop is there — an init failure then escapes into render", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {})
        const log: string[] = []
        const Bad = tracked(log, "Bad", { throwOn: "init" })

        expect(() =>
            render(
                <ModuleProvider root providers={[Bad]}>
                    <div />
                </ModuleProvider>
            )
        ).toThrowError(new Error("Bad init"))

        spy.mockRestore()
    })

    it("logs a destroy failure instead of throwing when there is no handler", async () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {})
        const log: string[] = []
        const Bad = tracked(log, "Bad", { throwOn: "destroy" })

        const { unmount } = render(
            <ModuleProvider root providers={[Bad]}>
                <div />
            </ModuleProvider>
        )

        unmount()
        await flush()

        // Nobody awaits destroy, so an unhandled rejection is the alternative — it is logged instead.
        expect(spy.mock.calls.length).toBe(1)
        expect(spy.mock.calls[0][0]).toBe("module.destroy")
        expect((spy.mock.calls[0][1] as Error).message).toBe("Bad destroy")

        spy.mockRestore()
    })

    it("reports a child module's failure to that child's handler only", () => {
        const parentErrors: Failure[] = []
        const childErrors: Failure[] = []
        const log: string[] = []
        const Bad = tracked(log, "Bad", { throwOn: "init" })

        render(
            <ModuleProvider root onModuleError={collectErrors(parentErrors)}>
                <ModuleProvider providers={[Bad]} onModuleError={collectErrors(childErrors)}>
                    <div />
                </ModuleProvider>
            </ModuleProvider>
        )

        expect(parentErrors).toEqual([])
        expect(childErrors).toEqual([["init", "Bad init"]])
    })
})
