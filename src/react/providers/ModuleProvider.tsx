import { useMemo, type JSX, type ReactNode } from "react"

import type { ModuleResolutionParams } from "../../core/module/resolution.types.js"
import { useModule } from "../hooks/useModule.js"
import { ModuleContext } from "../context/ModuleContext.js"

export type ModuleProviderProps = ModuleResolutionParams & {
    children?: ReactNode
}

export function ModuleProvider({ children, ...moduleParams }: ModuleProviderProps): JSX.Element {
    const module = useModule(moduleParams)

    const value = useMemo(
        () => ({
            container: module.container,
            owned: module.owned,
            id: module.id,
            rebuild: module.rebuild,
        }),
        [module.container, module.owned, module.id, module.rebuild]
    )

    return <ModuleContext.Provider value={value}>{children}</ModuleContext.Provider>
}
