import { useContext, useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from "react"
import { useEvent, useIsomorphicLayoutEffect, useScheduleLayoutEffect } from "@luminelabs/react-toolkit"

import type { Container } from "../../container/index.js"
import { Module, type ModuleParams } from "../../core/module/module.js"
import type { ModuleHooks, ModulePhase } from "../../core/providers/module-lifecycle/module-lifecycle.types.js"
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

/**
 * The one blessed boundary implementation, internal to ModuleProvider. Owns all four phases: constructs and
 * inits the module in state (zero observable window), mounts on effect, unmounts + destroys on cleanup, and
 * rebuilds — recreating the instance — on parent change or a rebuildOn diff.
 */
function useModule(params: ModuleParams, rebuildOn?: unknown[]): { module: Module; rebuild: () => void } {
    const parent = useContext(ModuleContext)?.module ?? null

    const hooks = useModuleHooks(params)
    const [module, setModule] = useState<Module>(() => createScopedModule(parent, params, hooks))

    // Lifecycle signals
    // ------------------------------------

    useEffect(() => {
        module.mount()

        return () => {
            module.unmount()
            // Nothing upstream can await this. destroy() only rejects if a user onModuleError throws.
            void module.destroy().catch((error) => console.error("module.onModuleError", error))
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
    const onModuleError = useEvent((phase: ModulePhase, error: unknown) => params.onModuleError?.(phase, error))

    // onModuleError is the exception: its PRESENCE decides whether a phase throws, so an always-present
    // wrapper would silently make every module swallow its own errors.
    return {
        onModuleInit,
        onModuleMount,
        onModuleUnmount,
        onModuleDestroy,
        ...(params.onModuleError ? { onModuleError } : {}),
    }
}

// Helpers
// ========================================

function rebuildOnChanged(prev: unknown[] | undefined, next: unknown[] | undefined): boolean {
    if (prev === undefined || next === undefined) return false
    if (prev.length !== next.length) return true
    return prev.some((value, index) => !Object.is(value, next[index]))
}
