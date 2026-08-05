import { useContext, useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from "react"
import { useEvent, useIsomorphicLayoutEffect, useScheduleLayoutEffect } from "@luminelabs/react-toolkit"

import type { Container } from "@remodulo/container"
import { Module, type ModuleParams } from "../../core/module/module.js"
import type { ModuleHooks } from "../../core/providers/module-lifecycle/module-lifecycle.types.js"
import { ModuleContext } from "../context/ModuleContext.js"

// ModuleProvider
// ========================================

export type ModuleProviderProps = ModuleParams & {
    rebuildOn?: unknown[]
    children?: ReactNode
}

export function ModuleProvider({ children, rebuildOn, ...params }: ModuleProviderProps): JSX.Element {
    const { module, rebuild } = useModule(params, rebuildOn)

    const value = useMemo(() => ({ module, rebuild }), [module, rebuild])

    return <ModuleContext.Provider value={value}>{children}</ModuleContext.Provider>
}

// useModule (internal)
// ========================================

function useModule(params: ModuleParams, rebuildOn?: unknown[]): { module: Module; rebuild: () => void } {
    const parent = useContext(ModuleContext)?.module ?? null

    const hooks = useModuleHooks(params)
    const [module, setModule] = useState<Module>(() => createScopedModule(parent, params, hooks))

    // Lifecycle signals
    // ------------------------------------

    useEffect(() => {
        module.mount()

        return () => {
            try {
                module.unmount()
            } finally {
                void module.destroy()
            }
        }
    }, [module])

    // Rebuild
    // ------------------------------------

    const schedule = useScheduleLayoutEffect()

    const performRebuild = useEvent(() => {
        setModule(createScopedModule(parent, params, hooks))
    })

    const rebuild = useEvent(() => {
        schedule("module.rebuild", performRebuild)
    })

    const prevParentRef = useRef(parent)
    useEffect(() => {
        if (prevParentRef.current !== parent) rebuild()
        prevParentRef.current = parent
    }, [parent, rebuild])

    const prevRebuildOnRef = useRef<unknown[] | undefined>(rebuildOn)
    useIsomorphicLayoutEffect(() => {
        const prev = prevRebuildOnRef.current
        prevRebuildOnRef.current = rebuildOn
        if (rebuildOnChanged(prev, rebuildOn)) rebuild()
    })

    return { module, rebuild }
}

function createScopedModule(parent: Module | null, params: ModuleParams, hooks: ModuleHooks): Module {
    if (!parent) {
        throw new Error(
            "ModuleProvider requires a parent module in context. Wrap it in <AppProvider>, or nest it under another <ModuleProvider>."
        )
    }

    const module = new Module(parent, { ...params, ...hooks })
    module.init()
    return module
}

// Hook bridge
// ========================================

function useModuleHooks(params: ModuleParams): ModuleHooks {
    const onModuleInit = useEvent((container: Container) => params.onModuleInit?.(container))
    const onModuleMount = useEvent((container: Container) => params.onModuleMount?.(container))
    const onModuleUnmount = useEvent((container: Container) => params.onModuleUnmount?.(container))
    const onModuleDestroy = useEvent((container: Container) => params.onModuleDestroy?.(container))

    return { onModuleInit, onModuleMount, onModuleUnmount, onModuleDestroy }
}

// Helpers
// ========================================

function rebuildOnChanged(prev: unknown[] | undefined, next: unknown[] | undefined): boolean {
    if (prev === undefined || next === undefined) return false
    if (prev.length !== next.length) return true
    return prev.some((value, index) => !Object.is(value, next[index]))
}
