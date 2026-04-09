import { act, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { useModuleContext } from "../../src/module/useModuleContext.js"
import { withModule } from "../../src/module/withModule.js"
import { useResolve } from "../../src/resolver/useResolve.js"

const TTitle = Symbol.for("tests.withModule.title")

class RebuildService {
    static nextVersion = 0
    readonly version = ++RebuildService.nextVersion
}

let rebuildModule: (() => void) | null = null

describe("withModule", () => {
    beforeEach(() => {
        RebuildService.nextVersion = 0
        rebuildModule = null
    })

    it("wraps component with ModuleProvider using static params", () => {
        function View() {
            const title = useResolve<string>(TTitle)
            return <div>{title}</div>
        }

        const Wrapped = withModule(View, {
            root: true,
            providers: [{ provide: TTitle, useValue: "Static Title" }],
        })

        render(<Wrapped />)

        expect(screen.getByText("Static Title")).toBeInTheDocument()
    })

    it("supports module params factory based on wrapped component props", () => {
        type Props = { title: string }

        function View() {
            const title = useResolve<string>(TTitle)
            return <div>{title}</div>
        }

        const Wrapped = withModule<Props>(View, (props) => ({
            root: true,
            providers: [{ provide: TTitle, useValue: props.title }],
        }))

        render(<Wrapped title="Dynamic Title" />)

        expect(screen.getByText("Dynamic Title")).toBeInTheDocument()
    })

    it("supports rebuild flow via wrapped module context", () => {
        function View() {
            const service = useResolve(RebuildService)
            const { id, rebuild } = useModuleContext()
            rebuildModule = rebuild

            return (
                <div>
                    <span data-testid="version">{service.version}</span>
                    <span data-testid="id">{id}</span>
                </div>
            )
        }

        const Wrapped = withModule(View, {
            root: true,
            providers: [RebuildService],
        })

        render(<Wrapped />)

        expect(screen.getByTestId("version").textContent).toBe("1")
        expect(screen.getByTestId("id").textContent).toBe("0")
        expect(rebuildModule).not.toBeNull()

        act(() => {
            rebuildModule?.()
        })

        expect(screen.getByTestId("version").textContent).toBe("2")
        expect(screen.getByTestId("id").textContent).toBe("1")
    })
})
