import React from "react"
import { type DependencyContainer } from "tsyringe"

export const ContainerContext = React.createContext<DependencyContainer | null>(null)

export function useContainer(): DependencyContainer {
    const container = React.useContext(ContainerContext)

    if (!container) {
        throw new Error("useContainer: no container in context. Wrap with <ModuleProvider>.")
    }

    return container
}