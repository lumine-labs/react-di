import { useContext } from "react"

import type { Container } from "../../container/index.js"
import type { Module } from "../../core/module/module.js"
import { ModuleContext, type ModuleContextValue } from "../context/ModuleContext.js"

export function useModuleContext(): ModuleContextValue {
    const value = useContext(ModuleContext)

    if (!value) {
        throw new Error("useModuleContext: no module in context. Wrap with <ModuleProvider>.")
    }

    return value
}

export function useModule(): Module {
    return useModuleContext().module
}

export function useContainer(): Container {
    return useModuleContext().module.container
}

export function useModuleRebuild(): () => void {
    return useModuleContext().rebuild
}
