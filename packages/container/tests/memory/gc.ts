// Leak-detection primitives
// ========================================
//
// Modelled on `packages/react/tests/memory/gc.ts`, minus the heap-trend sampling. React's suite churns a
// mount/rebuild/unmount scenario x1000 and needs a smoke alarm for retention through paths no WeakRef was
// pointed at (jsdom nodes, inversify tables). The kernel has no such surface: every claim here is a named
// object and a specific retaining edge, so WeakRef reachability IS the verdict and a heap ratio would only
// add noise.
//
// Two signals, as there:
//
//   1. WeakRef reachability — the check. An object that still `deref()`s after a forced major GC is
//      reachable from a GC root, i.e. retained.
//   2. FinalizationRegistry — corroboration. It only fires for objects the collector actually reclaimed,
//      so it distinguishes "collected" from "the WeakRef was cleared for some other reason".
//
// Reachability discipline for callers, and it is load-bearing rather than style: V8 keeps a function's
// locals alive for the whole activation, so an object held in a test function's local variable is
// reachable BY DEFINITION and will never be collected, leak or not. Every scenario in this directory
// therefore runs inside its own function call — once that call returns its frame is gone, and only then is
// the question "is this still reachable?" a real one.

type GcFn = () => void

function gcOrThrow(): GcFn {
    const gc = (globalThis as { gc?: GcFn }).gc

    if (typeof gc !== "function") {
        throw new Error(
            "global.gc is unavailable — the memory suite cannot distinguish 'collected' from 'not collected yet'. " +
                "Run it via `pnpm run test:memory` (which starts node with --expose-gc), not plain `vitest run`."
        )
    }

    return gc
}

/** Fail loudly when the flag is missing, rather than skipping and reporting green. */
export function assertGcEnabled(): void {
    gcOrThrow()
}

/** Yield to the macrotask queue: WeakRefs are held live for the remainder of the current job. */
export function settle(): Promise<void> {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, 0)
    })
}

/**
 * Force collection. Several major GCs with a macrotask between them: one pass frees the object, the next
 * frees whatever only it was keeping alive, and the yields let FinalizationRegistry callbacks drain.
 */
export async function forceGc(cycles = 6): Promise<void> {
    const gc = gcOrThrow()

    for (let i = 0; i < cycles; i += 1) {
        gc()
        // eslint-disable-next-line no-await-in-loop
        await settle()
    }
}

/**
 * Runs `work` a few times without tracking anything, then forces GC. The point is the last *tracked*
 * generation: V8 can keep it pinned through a stale register or an internal handle held by the call that
 * just returned. Churning untracked objects over the same code paths displaces those, so a survivor
 * afterwards is a real retaining edge rather than a scheduling artefact.
 */
export async function scrub(work: () => Promise<unknown> | unknown, rounds = 5): Promise<void> {
    for (let i = 0; i < rounds; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await work()
    }
    await settle()
    await forceGc(8)
}

// LeakTracker
// ========================================

type Entry = { label: string; ref: WeakRef<object> }

export type AliveByLabel = Record<string, number>

export class LeakTracker {
    readonly #entries: Entry[] = []
    readonly #finalized = new Map<string, number>()
    readonly #registry = new FinalizationRegistry<string>((label) => {
        this.#finalized.set(label, (this.#finalized.get(label) ?? 0) + 1)
    })

    /** Register `value` under `label` and hand it straight back, so tracking inlines into an expression. */
    track<T extends object>(label: string, value: T): T {
        this.#entries.push({ label, ref: new WeakRef(value) })
        this.#registry.register(value, label)
        return value
    }

    get size(): number {
        return this.#entries.length
    }

    trackedByLabel(): Record<string, number> {
        const counts: Record<string, number> = {}
        for (const entry of this.#entries) {
            counts[entry.label] = (counts[entry.label] ?? 0) + 1
        }
        return counts
    }

    /**
     * Labels that still have reachable instances, with how many. `toEqual({})` is the pass condition —
     * it prints exactly what survived and how badly, which a boolean assertion would not.
     */
    aliveByLabel(): AliveByLabel {
        const alive: AliveByLabel = {}
        for (const entry of this.#entries) {
            if (entry.ref.deref() === undefined) continue
            alive[entry.label] = (alive[entry.label] ?? 0) + 1
        }
        return alive
    }

    aliveCount(label: string): number {
        return this.aliveByLabel()[label] ?? 0
    }

    finalizedByLabel(): Record<string, number> {
        return Object.fromEntries(this.#finalized)
    }

    report(): string {
        const tracked = this.trackedByLabel()
        const alive = this.aliveByLabel()
        const finalized = this.finalizedByLabel()

        return Object.keys(tracked)
            .sort()
            .map((label) => {
                const total = tracked[label] ?? 0
                const live = alive[label] ?? 0
                const fin = finalized[label] ?? 0
                const verdict = live === 0 ? "collectible" : `RETAINED ${live}`
                return `  ${label.padEnd(28)} tracked ${String(total).padStart(4)}  finalized ${String(fin).padStart(4)}  ${verdict}`
            })
            .join("\n")
    }
}
