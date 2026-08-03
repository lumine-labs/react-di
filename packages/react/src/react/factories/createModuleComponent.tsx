import type { ComponentType, JSX, ReactNode } from "react"

import type { InjectionToken } from "../../container/index.js"
import type { PropsAdapter, PropsRef } from "../../core/providers/props-ref/props-ref.provider.js"
import { ModuleProvider, type ModuleProviderProps } from "../providers/ModuleProvider.js"
import { usePropsRef, type UsePropsRefOptions } from "../hooks/usePropsRef.js"

type ModuleParamsInput = Omit<ModuleProviderProps, "children">

export type CreateModuleComponentParams<P> = ModuleParamsInput | ((props: P) => ModuleParamsInput)

export type CreateModuleComponentOptions<P extends object, T = P> = {
    propsAdapter?: PropsAdapter<P, T>
    propsToken?: InjectionToken<PropsRef<T>>
}

export function createModuleComponent<P extends object = {}, T = P>(
    params?: CreateModuleComponentParams<P>,
    options?: CreateModuleComponentOptions<P, T>
): ComponentType<P & { children?: ReactNode }> {
    // The boundary spells them props*; the hook's own options are scoped by its name.
    const propsRefOptions: UsePropsRefOptions<P, T> = {
        adapter: options?.propsAdapter,
        token: options?.propsToken,
    }

    function Module(props: P & { children?: ReactNode }): JSX.Element {
        const { children, ...ownProps } = props

        // Auto-bridge: every createModuleComponent module registers a component-owned PropsRef automatically.
        const { provider } = usePropsRef(ownProps as P, propsRefOptions)
        const resolvedParams = typeof params === "function" ? params(ownProps as P) : params
        const providers = [provider, ...(resolvedParams?.providers ?? [])]

        const moduleParams: ModuleParamsInput = { ...(resolvedParams ?? {}), providers }

        return <ModuleProvider {...moduleParams}>{children}</ModuleProvider>
    }

    Module.displayName = "Module"

    return Module
}
