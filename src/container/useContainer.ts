import { createContext, useContext } from "react"
import { type DependencyContainer } from "../aliases/index.js"

export const ContainerContext = createContext<DependencyContainer | null>(null)

export function useContainer(): DependencyContainer {
    const container = useContext(ContainerContext)

    if (!container) {
        throw new Error("useContainer: no container in context. Wrap with <ModuleProvider>.")
    }

    return container
}
