import { useContext } from "react"
import { type DependencyContainer } from "../../aliases/index.js"
import { ModuleContext, type ModuleContextValue } from "../context/ModuleContext.js"

export function useModuleContext(): ModuleContextValue {
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
