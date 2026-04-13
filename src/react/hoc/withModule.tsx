import React, { type ComponentType, type JSX } from "react"

import type { ModuleResolutionParams } from "../../core/module/resolution.types.js"
import { ModuleProvider } from "../providers/ModuleProvider.js"

export type WithModuleParams<P> = ModuleResolutionParams | ((props: P) => ModuleResolutionParams)

export function withModule<P extends object>(
    Component: ComponentType<P>,
    moduleParams?: WithModuleParams<P>
): ComponentType<P> {
    function WithModuleComponent(props: P): JSX.Element {
        const resolvedParams = typeof moduleParams === "function" ? moduleParams(props) : moduleParams

        return (
            <ModuleProvider {...(resolvedParams ?? {})}>
                <Component {...props} />
            </ModuleProvider>
        )
    }

    const displayName = Component.displayName || Component.name || "Component"
    WithModuleComponent.displayName = `withModule(${displayName})`

    return WithModuleComponent
}
