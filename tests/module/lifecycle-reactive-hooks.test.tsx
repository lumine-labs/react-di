import { act, render } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"

import { ModuleProvider } from "../../src/module/ModuleProvider.js"

describe("module lifecycle reactive hooks", () => {
    it("uses latest React closure for module destroy hook without rebuild", async () => {
        const destroySpy = vi.fn()
        let setValue!: React.Dispatch<React.SetStateAction<number>>

        function Harness() {
            const [value, setStateValue] = React.useState(0)
            setValue = setStateValue

            return (
                <ModuleProvider
                    root
                    onModuleDestroy={() => {
                        destroySpy(value)
                    }}
                >
                    <div />
                </ModuleProvider>
            )
        }

        const view = render(<Harness />)

        act(() => {
            setValue(42)
        })

        view.unmount()
        await new Promise<void>((resolve) => setTimeout(resolve, 0))

        expect(destroySpy).toHaveBeenCalledTimes(1)
        expect(destroySpy).toHaveBeenLastCalledWith(42)
    })
})
