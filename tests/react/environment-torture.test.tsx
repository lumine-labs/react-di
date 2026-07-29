import { act, render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { StrictMode, type ReactNode } from "react"

import { decorate, Injectable } from "../../src/container/index.js"
import type { Provider } from "../../src/container/index.js"
import { App, type Module } from "../../src/core/module/module.js"
import { AppProvider } from "../../src/react/providers/AppProvider.js"
import { ModuleProvider } from "../../src/react/providers/ModuleProvider.js"
import { useModuleContext } from "../../src/react/hooks/useModuleContext.js"
import { Root } from "../setup/react.js"
import { flush } from "../setup/helpers.js"

// react-dom entry points
// ========================================
//
// `@types/react-dom` is not a dependency of this package — nothing in `src` imports react-dom, and this is
// the first test to need its server/client entry points. Rather than pull a types package in for two
// functions, they are imported dynamically and typed locally to exactly the surface used here. The
// suppressions go away on their own the day someone adds `@types/react-dom`: the directive would then be
// unused and `typecheck:tests` would say so.

type ReactDomServer = { renderToString: (element: ReactNode) => string }
type ReactDomClient = {
    hydrateRoot: (container: Element | DocumentFragment, children: ReactNode) => { unmount: () => void }
}

// @ts-expect-error -- untyped without @types/react-dom; the local type above is the contract used here.
const { renderToString } = (await import("react-dom/server")) as unknown as ReactDomServer
// @ts-expect-error -- untyped without @types/react-dom; the local type above is the contract used here.
const { hydrateRoot } = (await import("react-dom/client")) as unknown as ReactDomClient

// Environment torture — SSR and StrictMode
// ========================================
//
// Two environments the package makes no promises about, isolated here because they need their own
// renderers and their own console handling. Everything below is the CURRENT measured behavior
// (React 19.2 + jsdom), asserted exactly, so a change to it fails a test instead of drifting unnoticed.
//
// SSR comes out clean and is worth having as a floor. StrictMode does NOT — it is unsupported, and those
// tests exist to document the failure mode, not to bless it.

// Tracking
// ========================================

type Generation = { init: number; mount: number; unmount: number; destroy: number }

type Tracker = {
    provider: Provider
    /** One entry per constructed instance — i.e. per module generation — in construction order. */
    generations: Generation[]
}

function genTracker(log: string[] = [], label = "S"): Tracker {
    const generations: Generation[] = []

    const Service = class {
        readonly gen: Generation = { init: 0, mount: 0, unmount: 0, destroy: 0 }
        readonly n: number

        constructor() {
            this.n = generations.push(this.gen)
            log.push(`${label}${this.n}:ctor`)
        }

        onModuleInit() {
            this.gen.init++
            log.push(`${label}${this.n}:init`)
        }

        onModuleMount() {
            this.gen.mount++
            log.push(`${label}${this.n}:mount`)
        }

        onModuleUnmount() {
            this.gen.unmount++
            log.push(`${label}${this.n}:unmount`)
        }

        async onModuleDestroy() {
            this.gen.destroy++
            log.push(`${label}${this.n}:destroy`)
        }
    }

    decorate(Injectable(), Service)
    return { provider: Service as unknown as Provider, generations }
}

function captureConsoleError(): { calls: unknown[][]; restore: () => void } {
    const calls: unknown[][] = []
    const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
        calls.push(args)
    })
    return { calls, restore: () => spy.mockRestore() }
}

const text = (calls: unknown[][]): string => calls.map((call) => call.map(String).join(" ")).join("\n")

// SSR
// ========================================

describe("server rendering", () => {
    it("renders <AppProvider><ModuleProvider> to a string without crashing", () => {
        const console = captureConsoleError()
        const tracker = genTracker()
        const app = new App({ id: "ssr-app" })

        const html = renderToString(
            <AppProvider app={app}>
                <ModuleProvider id="ssr-module" providers={[tracker.provider]}>
                    <span>server content</span>
                </ModuleProvider>
            </AppProvider>
        )

        console.restore()

        expect(html).toContain("server content")

        // Init is render-phase work, so it DOES run on the server: the module is built and inited.
        expect(app.initialized).toBe(true)
        expect(tracker.generations.length).toBe(1)

        // Mount is an effect, and effects never run on the server. Nothing mounts, nothing is destroyed —
        // so a server-rendered module is an inited object that is garbage the moment the response is sent.
        // Same abandonment constraint as a suspended render: keep onModuleInit free of resource acquisition.
        expect(tracker.generations[0]).toEqual({ init: 1, mount: 0, unmount: 0, destroy: 0 })
        expect(app.mounted).toBe(false)
    })

    it("renders clean — no warning, not even about layout effects on the server", () => {
        const console = captureConsoleError()
        const app = new App()

        renderToString(
            <AppProvider app={app}>
                <ModuleProvider>
                    <span>content</span>
                </ModuleProvider>
            </AppProvider>
        )

        console.restore()

        // Worth pinning because it is not free: ModuleProvider's rebuild plumbing goes through
        // `useIsomorphicLayoutEffect`, which branches on `typeof window === "undefined"` — and under jsdom
        // `window` exists even while rendering to a string, so the LAYOUT branch is what runs here. It stays
        // silent, so the isomorphic branch is not load-bearing for a clean server render.
        expect(console.calls).toEqual([])
    })

    it("survives nested ModuleProviders and resolves through the forked containers", () => {
        const console = captureConsoleError()
        const outer = genTracker([], "Outer")
        const inner = genTracker([], "Inner")
        const app = new App()

        const html = renderToString(
            <AppProvider app={app}>
                <ModuleProvider id="outer" providers={[outer.provider]}>
                    <ModuleProvider id="inner" providers={[inner.provider]}>
                        <span>nested</span>
                    </ModuleProvider>
                </ModuleProvider>
            </AppProvider>
        )

        console.restore()

        expect(html).toContain("nested")
        expect(outer.generations).toEqual([{ init: 1, mount: 0, unmount: 0, destroy: 0 }])
        expect(inner.generations).toEqual([{ init: 1, mount: 0, unmount: 0, destroy: 0 }])

        // Attachment happens on mount, which never ran, so the server-side tree is structurally unlinked.
        expect(app.children.size).toBe(0)
    })

    it("hydrates the server markup on a fresh app without a mismatch", async () => {
        const server = genTracker([], "Server")
        const client = genTracker([], "Client")

        const tree = (app: App, tracker: Tracker): ReactNode => (
            <AppProvider app={app}>
                <ModuleProvider id="hydrated" providers={[tracker.provider]}>
                    <span data-testid="content">hydrate me</span>
                </ModuleProvider>
            </AppProvider>
        )

        const ssrConsole = captureConsoleError()
        const html = renderToString(tree(new App(), server))
        ssrConsole.restore()

        const host = document.createElement("div")
        host.innerHTML = html
        document.body.appendChild(host)

        const clientApp = new App()
        const hydrationConsole = captureConsoleError()
        let root: ReturnType<typeof hydrateRoot> | null = null
        await act(async () => {
            root = hydrateRoot(host, tree(clientApp, client))
        })
        hydrationConsole.restore()

        // No hydration warning, and the client took ownership: the client module ran the full render-phase
        // init AND the effect-phase mount.
        expect(text(hydrationConsole.calls)).not.toMatch(/hydrat|did not match|Text content does not match/i)
        expect(host.querySelector("[data-testid='content']")?.textContent).toBe("hydrate me")
        expect(client.generations).toEqual([{ init: 1, mount: 1, unmount: 0, destroy: 0 }])
        expect(clientApp.mounted).toBe(true)

        // The server generation is a different object and stayed exactly where SSR left it.
        expect(server.generations).toEqual([{ init: 1, mount: 0, unmount: 0, destroy: 0 }])

        await act(async () => {
            root?.unmount()
        })
        await flush()
        host.remove()

        expect(client.generations).toEqual([{ init: 1, mount: 1, unmount: 1, destroy: 1 }])
    })
})

// StrictMode
// ========================================
//
// StrictMode is UNSUPPORTED. These tests document the current failure mode so that changes to it are
// noticed, NOT to bless it. The double-invocation StrictMode applies to render and to effects hits the two
// places the module lifecycle lives — the render-phase `useState` initializer that builds and inits the
// module, and the effect that mounts/unmounts/destroys it.

describe("StrictMode (UNSUPPORTED — current failure mode, pinned)", () => {
    it("leaves a mounted tree DEAD: the module is destroyed by the simulated remount and never mounts again", async () => {
        const log: string[] = []
        const appTracker = genTracker(log, "App")
        const tracker = genTracker(log)
        const modules: Module[] = []

        function Probe(): ReactNode {
            modules.push(useModuleContext().module)
            return null
        }

        const { unmount } = render(
            <StrictMode>
                <Root providers={[appTracker.provider]}>
                    <ModuleProvider providers={[tracker.provider]}>
                        <Probe />
                    </ModuleProvider>
                </Root>
            </StrictMode>
        )
        await flush()

        // MEASURED, EXACT. Read it as three separate consequences of StrictMode's double-invocation:
        //
        // 1. The render initializer runs twice, so TWO modules are built and inited (S1, S2). React keeps
        //    the first; S2 is abandoned mid-render — inited, never mounted, therefore never destroyed.
        // 2. The mount effect is invoked, cleaned up, and invoked again. The cleanup unmounts AND destroys
        //    the committed module, so the "remount" call lands on a destroyed module: `mount()` bails on the
        //    `#destroyed` guard and nothing mounts a second time.
        // 3. The App is hit by the same simulated remount, and its `#committed` guard makes the second
        //    `app.mount()` a no-op too — the whole tree is left unmounted while still rendered.
        expect(log).toEqual([
            "App1:ctor",
            "App1:init",
            "S1:ctor",
            "S1:init",
            "S2:ctor",
            "S2:init",
            "App1:mount",
            "S1:mount",
            "S1:unmount",
            "App1:unmount",
            "S1:destroy",
        ])

        expect(tracker.generations.length).toBe(2)
        expect(tracker.generations[0]).toEqual({ init: 1, mount: 1, unmount: 1, destroy: 1 })
        expect(tracker.generations[1]).toEqual({ init: 1, mount: 0, unmount: 0, destroy: 0 })
        expect(appTracker.generations).toEqual([{ init: 1, mount: 1, unmount: 1, destroy: 0 }])

        // The live tree is holding a module that is initialized but no longer mounted.
        const committed = modules.at(-1)!
        expect(new Set(modules).size).toBe(1)
        expect(committed.initialized).toBe(true)
        expect(committed.mounted).toBe(false)

        // And the real unmount has nothing left to do — every phase already ran or is guarded off.
        log.length = 0
        unmount()
        await flush()
        expect(log).toEqual([])
    })

    it("is the same story for a nested boundary — both levels end up destroyed in place", async () => {
        const log: string[] = []
        const parent = genTracker(log, "P")
        const child = genTracker(log, "C")

        render(
            <StrictMode>
                <Root>
                    <ModuleProvider providers={[parent.provider]}>
                        <ModuleProvider providers={[child.provider]}>
                            <div />
                        </ModuleProvider>
                    </ModuleProvider>
                </Root>
            </StrictMode>
        )
        await flush()

        // Two generations at each level; the committed one at each level goes all the way to destroy, and
        // the second (abandoned) one at each level is inited and then dropped.
        expect(parent.generations).toEqual([
            { init: 1, mount: 1, unmount: 1, destroy: 1 },
            { init: 1, mount: 0, unmount: 0, destroy: 0 },
        ])
        expect(child.generations).toEqual([
            { init: 1, mount: 1, unmount: 1, destroy: 1 },
            { init: 1, mount: 0, unmount: 0, destroy: 0 },
        ])
    })
})
