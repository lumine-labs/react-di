import { useContext } from "react"

import type { Container } from "../../container"
import { ModuleContext, type ModuleContextValue } from "../context/ModuleContext.js"

export function useModuleContext(): ModuleContextValue {
    const value = useContext(ModuleContext)

    if (!value) {
        throw new Error("useModuleContext: no module in context. Wrap with <ModuleProvider>.")
    }

    return value
}

export function useContainer(): Container {
    return useModuleContext().container
}

export function useModuleRebuild(): () => void {
    return useModuleContext().rebuild
}
