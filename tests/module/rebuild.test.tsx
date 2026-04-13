import { act, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { ModuleProvider } from "../../src/react/providers/ModuleProvider"
import { useModuleContext } from "../../src/react/hooks/useModuleContext"
import { useResolve } from "../../src/react/hooks/useResolve"

class VersionedService {
    static nextVersion = 0
    readonly version = ++VersionedService.nextVersion
}

let rebuildModule: (() => void) | null = null

function Probe() {
    const service = useResolve(VersionedService)
    const { rebuild, id } = useModuleContext()
    rebuildModule = rebuild

    return (
        <div>
            <span data-testid="version">{service.version}</span>
            <span data-testid="id">{id}</span>
        </div>
    )
}

describe("module rebuild", () => {
    beforeEach(() => {
        VersionedService.nextVersion = 0
        rebuildModule = null
    })

    it("rebuilds module container and updates resolved instances", () => {
        render(
            <ModuleProvider root providers={[VersionedService]}>
                <Probe />
            </ModuleProvider>
        )

        expect(screen.getByTestId("version").textContent).toBe("1")
        expect(screen.getByTestId("id").textContent).toBe("0")
        expect(rebuildModule).not.toBeNull()

        act(() => {
            rebuildModule?.()
        })

        expect(screen.getByTestId("version").textContent).toBe("2")
        expect(screen.getByTestId("id").textContent).toBe("1")
    })

    it("coalesces multiple rebuild calls in one render cycle", () => {
        render(
            <ModuleProvider root providers={[VersionedService]}>
                <Probe />
            </ModuleProvider>
        )

        expect(screen.getByTestId("version").textContent).toBe("1")
        expect(screen.getByTestId("id").textContent).toBe("0")
        expect(rebuildModule).not.toBeNull()

        act(() => {
            rebuildModule?.()
            rebuildModule?.()
        })

        expect(screen.getByTestId("version").textContent).toBe("2")
        expect(screen.getByTestId("id").textContent).toBe("1")
    })
})
