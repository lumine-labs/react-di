import { createContext } from "react"
import type { Container } from "../../container"

export type ModuleContextValue = {
    container: Container
    id: string
    rebuild: () => void
}

export const ModuleContext = createContext<ModuleContextValue | null>(null)
