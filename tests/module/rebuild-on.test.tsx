import { act, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { useState } from "react"

import { ModuleProvider } from "../../src/react/providers/ModuleProvider"
import { useResolve } from "../../src/react/hooks/useResolve"

class VersionedService {
    static nextVersion = 0
    readonly version = ++VersionedService.nextVersion
}

let setTick: ((updater: (t: number) => number) => void) | null = null
let setDep: ((value: number) => void) | null = null

function Probe() {
    const service = useResolve(VersionedService)
    return <span data-testid="version">{service.version}</span>
}

function Harness() {
    const [tick, setTickState] = useState(0)
    const [dep, setDepState] = useState(0)
    setTick = setTickState
    setDep = setDepState

    return (
        <ModuleProvider root providers={[VersionedService]} rebuildOn={[dep]}>
            <Probe />
            <span data-testid="tick">{tick}</span>
        </ModuleProvider>
    )
}

describe("rebuildOn", () => {
    beforeEach(() => {
        VersionedService.nextVersion = 0
        setTick = null
        setDep = null
    })

    it("does not rebuild on first render or when rebuildOn values are unchanged", () => {
        render(<Harness />)

        // First render must not trigger a rebuild.
        expect(screen.getByTestId("version").textContent).toBe("1")

        // Re-render with an unrelated state change; rebuildOn value stays the same.
        act(() => {
            setTick?.((t) => t + 1)
        })

        expect(screen.getByTestId("tick").textContent).toBe("1")
        expect(screen.getByTestId("version").textContent).toBe("1")
    })

    it("rebuilds when a rebuildOn value changes", () => {
        render(<Harness />)

        expect(screen.getByTestId("version").textContent).toBe("1")

        act(() => {
            setDep?.(1)
        })

        expect(screen.getByTestId("version").textContent).toBe("2")
    })
})
