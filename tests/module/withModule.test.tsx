import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { withModule } from "../../src/module/withModule.js"
import { useResolve } from "../../src/resolver/useResolve.js"

const TTitle = Symbol.for("tests.withModule.title")

describe("withModule", () => {
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
})
