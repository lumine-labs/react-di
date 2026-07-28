import type { ComponentType, JSX, ReactNode } from "react"

import { ModuleProvider, type ModuleProviderProps } from "../providers/ModuleProvider.js"
import { usePropsRef, type UsePropsRefOptions } from "../hooks/usePropsRef.js"

type ModuleParamsInput = Omit<ModuleProviderProps, "children">

export type CreateModuleComponentParams<P> = ModuleParamsInput | ((props: P) => ModuleParamsInput)

export type CreateModuleComponentOptions<P extends object, T = P> = UsePropsRefOptions<P, T>

export function createModuleComponent<P extends object = {}, T = P>(
    params?: CreateModuleComponentParams<P>,
    options?: CreateModuleComponentOptions<P, T>
): ComponentType<P & { children?: ReactNode }> {
    function Module(props: P & { children?: ReactNode }): JSX.Element {
        const { children, ...ownProps } = props

        // Auto-bridge: every createModuleComponent module registers a component-owned PropsRef automatically.
        const { provider } = usePropsRef(ownProps as P, options)
        const resolvedParams = typeof params === "function" ? params(ownProps as P) : params
        const providers = [provider, ...(resolvedParams?.providers ?? [])]

        const moduleParams: ModuleParamsInput = { ...(resolvedParams ?? {}), providers }

        return <ModuleProvider {...moduleParams}>{children}</ModuleProvider>
    }

    Module.displayName = "Module"

    return Module
}
