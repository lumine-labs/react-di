import { createContext, useContext } from "react"
import { type DependencyContainer } from "../aliases/index.js"

import type { UseModuleResult } from "./types.js"

export const ModuleContext = createContext<UseModuleResult | null>(null)

export function useModuleContext(): UseModuleResult {
    const value = useContext(ModuleContext)

    if (!value) {
        throw new Error("useModuleContext: no module in context. Wrap with <ModuleProvider>.")
    }

    return value
}

export function useContainer(): DependencyContainer {
    return useModuleContext().container
}

export function useModuleRebuild(): () => void {
    return useModuleContext().rebuild
}
