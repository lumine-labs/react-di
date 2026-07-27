import { useContext, useEffect, useRef, useState } from "react"
import { useEvent, useIsomorphicLayoutEffect, useScheduleLayoutEffect } from "@luminelabs/react-toolkit"

import type { Container } from "../../container"
import type { ModuleResolution, ModuleResolutionParams } from "../../core/module/resolution.types.js"
import type { ModuleHooks, ModulePhase } from "../../core/providers/module-lifecycle/module-lifecycle.types.js"
import { ModuleContext, type ModuleContextValue } from "../context/ModuleContext.js"
import { ModuleLifecycle } from "../../core/providers/module-lifecycle/module-lifecycle.provider.js"
import { createModuleResolution } from "../../core/module/resolution.js"

// useModule
// ========================================

export function useModule(params?: ModuleResolutionParams): ModuleContextValue {
    const parentContainer = useContext(ModuleContext)?.container ?? null

    const hooks = useModuleHooks(params)
    const [resolution, setResolution] = useState<ModuleResolution>(() =>
        createModuleResolution(parentContainer, withHooks(params, hooks))
    )

    // Lifecycle signals
    // ------------------------------------

    useEffect(() => {
        const lifecycle = resolution.container.resolve(ModuleLifecycle)
        lifecycle.mount()

        return () => {
            lifecycle.unmount()
            // Nothing upstream can await this. destroy() only rejects if a user onModuleError throws.
            void lifecycle.destroy().catch((error) => console.error("module.onModuleError", error))
        }
    }, [resolution])

    // Rebuild
    // ------------------------------------

    const schedule = useScheduleLayoutEffect()

    const performRebuild = useEvent(() => {
        setResolution(createModuleResolution(parentContainer, withHooks(params, hooks)))
    })

    const rebuild = useEvent(() => {
        schedule("module.rebuild", performRebuild)
    })

    const prevParentRef = useRef(parentContainer)
    useEffect(() => {
        const isScoped = !params?.root && !params?.factory
        if (isScoped && prevParentRef.current !== parentContainer) rebuild()
        prevParentRef.current = parentContainer
    }, [parentContainer, rebuild])

    const prevRebuildOnRef = useRef<unknown[] | undefined>(params?.rebuildOn)
    useIsomorphicLayoutEffect(() => {
        const prev = prevRebuildOnRef.current
        const next = params?.rebuildOn
        prevRebuildOnRef.current = next
        if (rebuildOnChanged(prev, next)) rebuild()
    })

    return { container: resolution.container, id: resolution.id, rebuild }
}

// Hook bridge
// ========================================

function useModuleHooks(params?: ModuleResolutionParams): ModuleHooks {
    const onModuleInit = useEvent((container: Container) => params?.onModuleInit?.(container))
    const onModuleMount = useEvent((container: Container) => params?.onModuleMount?.(container))
    const onModuleUnmount = useEvent((container: Container) => params?.onModuleUnmount?.(container))
    const onModuleDestroy = useEvent((container: Container) => params?.onModuleDestroy?.(container))
    const onModuleError = useEvent((phase: ModulePhase, error: unknown) => params?.onModuleError?.(phase, error))

    // onModuleError is the exception: its PRESENCE decides whether a phase throws, so an always-present
    // wrapper would silently make every module swallow its own errors.
    return {
        onModuleInit,
        onModuleMount,
        onModuleUnmount,
        onModuleDestroy,
        ...(params?.onModuleError ? { onModuleError } : {}),
    }
}

// Helpers
// ========================================

function withHooks(params: ModuleResolutionParams | undefined, hooks: ModuleHooks): ModuleResolutionParams {
    return { ...params, ...hooks }
}

function rebuildOnChanged(prev: unknown[] | undefined, next: unknown[] | undefined): boolean {
    if (prev === undefined || next === undefined) return false
    if (prev.length !== next.length) return true
    return prev.some((value, index) => !Object.is(value, next[index]))
}
