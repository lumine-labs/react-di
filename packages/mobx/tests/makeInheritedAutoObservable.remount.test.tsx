import { act, fireEvent, render, screen } from "@testing-library/react"
import { isAction } from "mobx"
import { App, AppProvider, createModuleComponent, useResolve } from "@remodulo/react"
import { beforeEach, describe, expect, it } from "vitest"
import { useState } from "react"

import { makeInheritedAutoObservable } from "../src/makeInheritedAutoObservable"

// Fixture: a store constructed by the module container, whose method is handed to onClick detached --
// exactly the shape that hid the cached-annotation-map bug in a real app.
// ========================================

class ThemeStore {
    theme = "light"
    persisted: string | null = null

    constructor() {
        makeInheritedAutoObservable(this, {}, { autoBind: true })
    }

    get isDark(): boolean {
        return this.theme === "dark"
    }

    toggle(): void {
        this.theme = this.theme === "dark" ? "light" : "dark"
        this.persist()
    }

    persist(): void {
        this.persisted = this.theme
    }
}

const ThemeModule = createModuleComponent({
    providers: [{ provide: ThemeStore, useFactory: () => new ThemeStore() }],
})

let capturedStore: ThemeStore | null = null

function Probe() {
    const store = useResolve(ThemeStore)
    capturedStore = store
    // Detached reference: the handler loses `this` unless autoBind survived.
    return (
        <button type="button" data-testid="toggle" onClick={store.toggle}>
            toggle
        </button>
    )
}

function Harness() {
    const [app] = useState(() => new App())
    return (
        <AppProvider app={app}>
            <ThemeModule>
                <Probe />
            </ThemeModule>
        </AppProvider>
    )
}

describe("makeInheritedAutoObservable through the module-component path", () => {
    beforeEach(() => {
        capturedStore = null
    })

    it("keeps the detached click handler working after a remount builds a second instance", () => {
        const first = render(<Harness />)
        const firstStore = capturedStore!

        fireEvent.click(screen.getByTestId("toggle"))

        expect(isAction(firstStore.toggle)).toBe(true)
        expect(firstStore.theme).toBe("dark")
        expect(firstStore.isDark).toBe(true)
        expect(firstStore.persisted).toBe("dark")

        act(() => {
            first.unmount()
        })
        capturedStore = null

        render(<Harness />)
        const secondStore = capturedStore!

        expect(secondStore).not.toBe(firstStore)

        fireEvent.click(screen.getByTestId("toggle"))

        expect(isAction(secondStore.toggle)).toBe(true)
        expect(secondStore.theme).toBe("dark")
        expect(secondStore.isDark).toBe(true)
        expect(secondStore.persisted).toBe("dark")
    })
})
