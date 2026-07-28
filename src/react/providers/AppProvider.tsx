import { useEffect, useMemo, type JSX, type ReactNode } from "react"

import type { App } from "../../core/module/module.js"
import { ModuleContext } from "../context/ModuleContext.js"

// AppProvider
// ========================================

export type AppProviderProps = {
    app: App
    children?: ReactNode
}

/**
 * Drives an owner-created App: ensures it is initialized before children render (a scoped child throws if
 * its parent is not initialized), mounts on effect, unmounts on cleanup. It NEVER destroys — whoever called
 * `new App(...)` owns `app.destroy()`. Rebuild is a no-op here; the App instance is owned outside the tree.
 */
export function AppProvider({ app, children }: AppProviderProps): JSX.Element {
    if (!app.initialized) app.init()

    useEffect(() => {
        app.mount()

        return () => {
            app.unmount()
        }
    }, [app])

    const value = useMemo(() => ({ module: app, rebuild: noop }), [app])

    return <ModuleContext.Provider value={value}>{children}</ModuleContext.Provider>
}

// Helpers
// ========================================

function noop(): void {}
