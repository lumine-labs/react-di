import { type JSX, type ReactNode } from "react"

import { type UseModuleParams } from "./types.js"
import { useModule } from "./useModule.js"
import { ContainerContext } from "../container/useContainer.js"

export type ModuleProviderProps = UseModuleParams & {
    children?: ReactNode
}

export function ModuleProvider({ children, ...moduleParams }: ModuleProviderProps): JSX.Element {
    const container = useModule(moduleParams)
    return <ContainerContext.Provider value={container}>{children}</ContainerContext.Provider>
}
