import { describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"
import { useState, type ReactNode } from "react"

import { decorate, Injectable } from "../../src/V2/container/index.js"
import type { Provider } from "../../src/V2/container/index.js"
import { ModuleProvider } from "../../src/V2/react/providers/ModuleProvider.js"
import { useResolve } from "../../src/V2/react/hooks/useResolve.js"
import { useModuleContext } from "../../src/V2/react/hooks/useModuleContext.js"

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function svc(log: string[], label: string) {
    const K = class {
        onModuleInit() { log.push(`${label}:init`) }
        onModuleMount() { log.push(`${label}:mount`) }
        onModuleUnmount() { log.push(`${label}:unmount`) }
        async onModuleDestroy() { log.push(`${label}:destroy`) }
    }
    decorate(Injectable(), K)
    return K as unknown as Provider
}

describe("V2 lifecycle through React", () => {
    it("runs all four phases across a nested tree in the right order", async () => {
        const log: string[] = []
        const { unmount } = render(
            <ModuleProvider root providers={[svc(log, "P")]}>
                <ModuleProvider providers={[svc(log, "C")]}>
                    <div />
                </ModuleProvider>
            </ModuleProvider>
        )

        expect(log.filter((l) => l.endsWith(":init"))).toEqual(["P:init", "C:init"])
        expect(log.filter((l) => l.endsWith(":mount"))).toEqual(["P:mount", "C:mount"])

        log.length = 0
        unmount()
        expect(log.filter((l) => l.endsWith(":unmount"))).toEqual(["C:unmount", "P:unmount"])

        await flush()
        expect(log.filter((l) => l.endsWith(":destroy"))).toEqual(["C:destroy", "P:destroy"])
    })

    it("defers a destroy hook that actually suspends, keeping order", async () => {
        const log: string[] = []
        const slow = (label: string, ms: number) => {
            const K = class {
                async onModuleDestroy() {
                    await new Promise((resolve) => setTimeout(resolve, ms))
                    log.push(`${label}:destroy`)
                }
            }
            decorate(Injectable(), K)
            return K as unknown as Provider
        }

        const { unmount } = render(
            <ModuleProvider root providers={[slow("P", 20)]}>
                <ModuleProvider providers={[slow("C", 5)]}>
                    <div />
                </ModuleProvider>
            </ModuleProvider>
        )

        unmount()
        expect(log).toEqual([])

        await new Promise((resolve) => setTimeout(resolve, 60))
        expect(log).toEqual(["C:destroy", "P:destroy"])
    })

    it("fires module hooks around provider hooks", async () => {
        const log: string[] = []
        const { unmount } = render(
            <ModuleProvider
                root
                providers={[svc(log, "svc")]}
                onModuleInit={() => log.push("module:init")}
                onModuleMount={() => log.push("module:mount")}
                onModuleUnmount={() => log.push("module:unmount")}
                onModuleDestroy={() => log.push("module:destroy")}
            >
                <div />
            </ModuleProvider>
        )
        expect(log).toEqual(["module:init", "svc:init", "module:mount", "svc:mount"])

        log.length = 0
        unmount()
        await flush()
        expect(log).toEqual(["svc:unmount", "module:unmount", "svc:destroy", "module:destroy"])
    })

    it("resolves through useResolve and exposes the module id", () => {
        const log: string[] = []
        const Token = svc(log, "S")
        let seenId: string | undefined

        function Child(): ReactNode {
            useResolve(Token as never)
            seenId = useModuleContext().id
            return null
        }

        render(
            <ModuleProvider root id="app" providers={[Token]}>
                <Child />
            </ModuleProvider>
        )
        expect(seenId).toBe("app")
    })

    it("tears down only the subtree that unmounts", async () => {
        const log: string[] = []
        function Tree({ showChild }: { showChild: boolean }): ReactNode {
            return (
                <ModuleProvider root providers={[svc(log, "P")]}>
                    {showChild ? <ModuleProvider providers={[svc(log, "C")]}><div /></ModuleProvider> : null}
                </ModuleProvider>
            )
        }
        const { rerender } = render(<Tree showChild />)
        log.length = 0

        rerender(<Tree showChild={false} />)
        await flush()
        expect(log).toEqual(["C:unmount", "C:destroy"])
    })

    it("keeps a lazy provider unbuilt until resolved", async () => {
        const log: string[] = []
        const Token = svc(log, "L")

        function Child({ resolveIt }: { resolveIt: boolean }): ReactNode {
            if (resolveIt) useResolve(Token as never)
            return null
        }

        const { rerender, unmount } = render(
            <ModuleProvider root providers={[{ provide: Token, useClass: Token, lazy: true } as Provider]}>
                <Child resolveIt={false} />
            </ModuleProvider>
        )
        expect(log).toEqual([])

        rerender(
            <ModuleProvider root providers={[{ provide: Token, useClass: Token, lazy: true } as Provider]}>
                <Child resolveIt />
            </ModuleProvider>
        )
        expect(log).toEqual(["L:init"])

        log.length = 0
        unmount()
        await flush()
        expect(log).toEqual(["L:unmount", "L:destroy"])
    })

    it("does not leave an unhandled rejection when a destroy hook throws", async () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {})
        const rejections: unknown[] = []
        const onRejection = (event: PromiseRejectionEvent) => rejections.push(event.reason)
        window.addEventListener("unhandledrejection", onRejection)

        const Bad = class { async onModuleDestroy() { throw new Error("destroy boom") } }
        decorate(Injectable(), Bad)

        const { unmount } = render(
            <ModuleProvider root providers={[Bad as unknown as Provider]}>
                <div />
            </ModuleProvider>
        )
        unmount()
        await flush()

        window.removeEventListener("unhandledrejection", onRejection)
        expect(rejections).toEqual([])
        expect(spy).toHaveBeenCalled()
        spy.mockRestore()
    })
})
