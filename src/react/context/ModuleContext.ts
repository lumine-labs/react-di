import { createContext } from "react"
import type { DependencyContainer } from "../../aliases/index.js"

export type ModuleContextValue = {
    container: DependencyContainer
    owned: boolean
    id: string
    rebuild: () => void
}

export const ModuleContext = createContext<ModuleContextValue | null>(null)
