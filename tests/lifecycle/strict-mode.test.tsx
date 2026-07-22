import { act, render } from "@testing-library/react"
import { StrictMode, type ReactNode } from "react"
import { beforeEach, describe, expect, it } from "vitest"

import { ModuleProvider } from "../../src/react/providers/ModuleProvider"
import type {
    FactoryModuleParams,
    RootModuleParams,
    ScopedModuleParams,
} from "../../src/core/module/resolution.types"

// StrictMode is SUPPORTED. Deferred-microtask teardown + resurrection collapse
// the mount → cleanup → mount double-invoke into a single correctly-ordered mount cascade: the cleanup's
// scheduleTeardown() is cancelled by the second commit() before the flush microtask fires.

let log: string[] = []

// LogModule always supplies the lifecycle hooks, so it only models the hook-bearing (owned)
// branches of the discriminated union — never the inherit/container branch, which forbids them.
type LogModuleParams = RootModuleParams | FactoryModuleParams | ScopedModuleParams

type LogModuleProps = LogModuleParams & {
    name: string
    children?: ReactNode
}

function LogModule({ name, children, ...params }: LogModuleProps) {
    return (
        <ModuleProvider
            {...params}
            onModuleMount={() => log.push(`${name}:mount`)}
            onModuleUnmount={() => log.push(`${name}:unmount`)}
            onModuleDestroy={() => log.push(`${name}:destroy`)}
        >
            {children}
        </ModuleProvider>
    )
}

async function settle(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
    })
}

beforeEach(() => {
    log = []
})

describe("StrictMode", () => {
    it("mounts a nested tree exactly once, in order, with no phantom double-invoke", async () => {
        render(
            <StrictMode>
                <LogModule root name="A">
                    <LogModule name="B">
                        <LogModule name="C" />
                    </LogModule>
                </LogModule>
            </StrictMode>
        )

        // Let any (cancelled) scheduled teardown microtask drain — resurrection must keep the tree alive.
        await settle()

        expect(log).toEqual(["A:mount", "B:mount", "C:mount"])
    })

    it("does not double-destroy or leave phantom children on unmount", async () => {
        const view = render(
            <StrictMode>
                <LogModule root name="A">
                    <LogModule name="B">
                        <LogModule name="C" />
                    </LogModule>
                </LogModule>
            </StrictMode>
        )
        await settle()
        log = []

        view.unmount()
        await settle()

        // Exactly one clean, correctly-ordered destroy of each node — no duplicates.
        expect(log).toEqual(["C:unmount", "C:destroy", "B:unmount", "B:destroy", "A:unmount", "A:destroy"])
    })

    it("no node mounts or destroys more than once across the full lifecycle", async () => {
        const view = render(
            <StrictMode>
                <LogModule root name="A">
                    <LogModule name="B" />
                </LogModule>
            </StrictMode>
        )
        await settle()
        view.unmount()
        await settle()

        const count = (entry: string) => log.filter((e) => e === entry).length
        for (const entry of ["A:mount", "B:mount", "A:destroy", "B:destroy", "A:unmount", "B:unmount"]) {
            expect(count(entry)).toBe(1)
        }
    })
})
