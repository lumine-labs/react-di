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
        expect(rebuildModule).not.toBeNull()

        act(() => {
            rebuildModule?.()
        })

        // Rebuild is detected via the freshly-constructed VersionedService (version increments).
        expect(screen.getByTestId("version").textContent).toBe("2")
    })

    it("coalesces multiple rebuild calls in one render cycle", () => {
        render(
            <ModuleProvider root providers={[VersionedService]}>
                <Probe />
            </ModuleProvider>
        )

        expect(screen.getByTestId("version").textContent).toBe("1")
        expect(rebuildModule).not.toBeNull()

        act(() => {
            rebuildModule?.()
            rebuildModule?.()
        })

        // The single version bump (1→2, not 1→3) proves the two calls coalesced into one rebuild.
        expect(screen.getByTestId("version").textContent).toBe("2")
    })

    it("keeps a params-supplied id stable across rebuilds", () => {
        render(
            <ModuleProvider root id="feature:stable" providers={[VersionedService]}>
                <Probe />
            </ModuleProvider>
        )

        expect(screen.getByTestId("version").textContent).toBe("1")
        expect(screen.getByTestId("id").textContent).toBe("feature:stable")

        // A user-supplied id is the addressable identity — params re-deliver the same string every
        // render, so it survives rebuilds (each of which constructs a fresh VersionedService).
        for (let n = 2; n <= 4; n += 1) {
            act(() => {
                rebuildModule?.()
            })
            expect(screen.getByTestId("version").textContent).toBe(String(n))
            expect(screen.getByTestId("id").textContent).toBe("feature:stable")
        }
    })

    it("regenerates a per-resolution generated id on each rebuild", () => {
        render(
            <ModuleProvider root providers={[VersionedService]}>
                <Probe />
            </ModuleProvider>
        )

        const idBefore = screen.getByTestId("id").textContent
        expect(idBefore).toBeTruthy()
        expect(screen.getByTestId("version").textContent).toBe("1")

        act(() => {
            rebuildModule?.()
        })

        // A generated id is a per-resolution debug label, fresh on each rebuild. Because nothing can
        // address a module by it, this instability is unobservable to consumers (unlike a params id).
        expect(screen.getByTestId("version").textContent).toBe("2")
        expect(screen.getByTestId("id").textContent).not.toBe(idBefore)
    })
})
