import { act, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"

import { ModuleProvider } from "../../src/module/ModuleProvider.js"
import { useModuleContext } from "../../src/module/useModuleContext.js"
import { useResolve } from "../../src/resolver/useResolve.js"

class ParentService {
    static nextVersion = 0
    readonly version = ++ParentService.nextVersion
}

const TChildParentVersion = Symbol.for("tests.child.parent.version")

let rebuildParent: (() => void) | null = null

function ParentControls() {
    const module = useModuleContext()
    rebuildParent = module.rebuild
    return null
}

function ChildProbe() {
    const parentVersion = useResolve<number>(TChildParentVersion)
    return <span data-testid="parent-version">{parentVersion}</span>
}

describe("scoped module parent rebuild", () => {
    beforeEach(() => {
        ParentService.nextVersion = 0
        rebuildParent = null
    })

    it("rebuilds scoped child module when parent container changes", () => {
        render(
            <ModuleProvider root providers={[ParentService]}>
                <ParentControls />
                <ModuleProvider
                    providers={[
                        {
                            provide: TChildParentVersion,
                            useFactory: (parentService: ParentService) => parentService.version,
                            inject: [ParentService],
                        },
                    ]}
                >
                    <ChildProbe />
                </ModuleProvider>
            </ModuleProvider>
        )

        expect(screen.getByTestId("parent-version").textContent).toBe("1")
        expect(rebuildParent).not.toBeNull()

        act(() => {
            rebuildParent?.()
        })

        expect(screen.getByTestId("parent-version").textContent).toBe("2")
    })
})
