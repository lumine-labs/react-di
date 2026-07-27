import { decorate, Injectable } from "../../src/container/decorators.js"
import type { Provider } from "../../src/types.js"

// Shared test helpers
// ========================================
//
// vitest transforms with esbuild, which emits no `design:paramtypes`. Decorators must therefore be applied
// through `decorate()`, and constructor injection needs an explicit `Inject(TOKEN)` per parameter.

export const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

export type HookCounts = { init: number; mount: number; unmount: number; destroy: number }

export type TrackedOptions = {
    /** Suspend for this many ms inside onModuleDestroy before recording it. */
    destroyDelay?: number
    /** Throw from this phase. */
    throwOn?: "init" | "mount" | "unmount" | "destroy"
}

export type Tracked = Provider & { counts: HookCounts }

/**
 * An injectable class that appends `<label>:<phase>` to `log` for every lifecycle hook and counts them.
 * Returned as a Provider so it can be used as a bare constructor-shorthand or as `useClass`.
 */
export function tracked(log: string[], label: string, options: TrackedOptions = {}): Tracked {
    const counts: HookCounts = { init: 0, mount: 0, unmount: 0, destroy: 0 }

    const Service = class {
        static counts = counts

        constructor() {
            log.push(`${label}:ctor`)
        }

        onModuleInit() {
            if (options.throwOn === "init") throw new Error(`${label} init`)
            counts.init++
            log.push(`${label}:init`)
        }

        onModuleMount() {
            if (options.throwOn === "mount") throw new Error(`${label} mount`)
            counts.mount++
            log.push(`${label}:mount`)
        }

        onModuleUnmount() {
            if (options.throwOn === "unmount") throw new Error(`${label} unmount`)
            counts.unmount++
            log.push(`${label}:unmount`)
        }

        async onModuleDestroy() {
            if (options.throwOn === "destroy") throw new Error(`${label} destroy`)
            if (options.destroyDelay) await new Promise((resolve) => setTimeout(resolve, options.destroyDelay))
            counts.destroy++
            log.push(`${label}:destroy`)
        }
    }

    decorate(Injectable(), Service)
    return Service as unknown as Tracked
}

/** An injectable class with no lifecycle hooks. */
export function plain(label = "plain"): Provider {
    const Service = class {
        readonly label = label
    }
    decorate(Injectable(), Service)
    return Service as unknown as Provider
}

/** Entries in `log` whose phase matches, e.g. `phase(log, "init")`. */
export function phase(log: string[], name: string): string[] {
    return log.filter((entry) => entry.endsWith(`:${name}`))
}
