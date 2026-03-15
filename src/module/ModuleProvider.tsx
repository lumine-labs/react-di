import React from "react"
import { ContainerContext } from "../container/useContainer"
import { type UseModuleParams } from "./types"
import { useModuleContainer } from "./useModule"

export type ModuleProviderProps = UseModuleParams & {
    children?: React.ReactNode
}

export function ModuleProvider({ children, ...moduleParams }: ModuleProviderProps): React.JSX.Element {
    const container = useModuleContainer(moduleParams)
    return <ContainerContext.Provider value={container}>{children}</ContainerContext.Provider>
}
