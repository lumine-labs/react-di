import { useEffect, useMemo, useState, type JSX, type ReactNode } from "react"

import type { App } from "../../core/module/module.js"
import { ModuleContext } from "../context/ModuleContext.js"

// AppProvider
// ========================================

export type AppProviderProps = {
    app: App | (() => App)
    children?: ReactNode
}

/** React root for an App: captures it once and owns its init, mount, unmount and destroy. */
export function AppProvider({ app, children }: AppProviderProps): JSX.Element {
    const [ownedApp] = useState(() => {
        const instance = typeof app === "function" ? app() : app
        if (!instance.initialized) instance.init()
        return instance
    })

    if (typeof app !== "function" && app !== ownedApp) {
        throw new Error("AppProvider does not support replacing its App instance")
    }

    useEffect(() => {
        ownedApp.mount()

        return () => {
            try {
                ownedApp.unmount()
            } finally {
                void ownedApp.destroy()
            }
        }
    }, [ownedApp])

    const value = useMemo(() => ({ module: ownedApp, rebuild: noop }), [ownedApp])

    return <ModuleContext.Provider value={value}>{children}</ModuleContext.Provider>
}

// Helpers
// ========================================

function noop(): void {}
