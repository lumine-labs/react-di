// Leak-detection primitives
// ========================================
//
// Two independent signals, both required, because neither is sufficient on its own:
//
//   1. WeakRef reachability — the real check. A tracked object that still `deref()`s after a forced major
//      GC is reachable from a GC root, i.e. leaked. FinalizationRegistry corroborates: it only fires for
//      objects the collector actually reclaimed.
//   2. `process.memoryUsage().heapUsed` growth — a smoke alarm. It catches retention through paths a
//      WeakRef assertion was never pointed at (a growing array of strings, jsdom nodes, inversify tables),
//      at the cost of being noisy. Thresholds here are deliberately generous.
//
// Reachability discipline for callers: V8 keeps a function's locals alive for the whole activation, so a
// tracked object held in a test function's local variable is *reachable by definition* and will never be
// collected, leak or not. Every churn loop in this directory therefore runs its iteration body inside its
// own function call — once that call returns, its frame is gone and the objects are genuinely unreachable.

// GC access
// ========================================

type GcFn = () => void

function gcOrThrow(): GcFn {
    const gc = (globalThis as { gc?: GcFn }).gc

    if (typeof gc !== "function") {
        throw new Error(
            "global.gc is unavailable — the memory suite cannot distinguish 'collected' from 'not collected yet'. " +
                "Run it via `npm run test:memory` (which starts node with --expose-gc), not plain `vitest run`."
        )
    }

    return gc
}

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

// Heap sampling
// ========================================

export function heapUsedMB(): number {
    return process.memoryUsage().heapUsed / (1024 * 1024)
}

export type HeapSample = { at: number; mb: number }

export class HeapTrend {
    readonly samples: HeapSample[] = []

    async sample(at: number): Promise<void> {
        await forceGc(3)
        this.samples.push({ at, mb: heapUsedMB() })
    }

    get baseline(): number {
        return this.samples[0]?.mb ?? 0
    }

    get final(): number {
        return this.samples.at(-1)?.mb ?? 0
    }

    get ratio(): number {
        return this.baseline > 0 ? this.final / this.baseline : 0
    }

    /**
     * Absolute MB added between the first and last sample. The sharper of the two smoke alarms here: the
     * baseline is dominated by vitest + jsdom, so a fixture leaking tens of MB can still land under a 3x
     * ratio. Sized against the fixture payload — see the thresholds at the call sites.
     */
    get growthMB(): number {
        return this.final - this.baseline
    }

    report(): string {
        const points = this.samples.map((s) => `${s.at}:${s.mb.toFixed(1)}MB`).join("  ")
        return `heapUsed ${points}  (+${this.growthMB.toFixed(1)}MB, ratio ${this.ratio.toFixed(2)}x)`
    }
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

    /** Register `value` under `label` and hand it straight back, so tracking inlines into a factory. */
    track<T extends object>(label: string, value: T): T {
        this.#entries.push({ label, ref: new WeakRef(value) })
        this.#registry.register(value, label)
        return value
    }

    trackAll(label: string, values: readonly object[]): void {
        for (const value of values) this.track(label, value)
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
     * Labels that still have reachable instances, with how many. An empty object is the pass condition —
     * `expect(tracker.aliveByLabel()).toEqual({})` prints exactly which class survived and how badly.
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

        const lines = Object.keys(tracked)
            .sort()
            .map((label) => {
                const total = tracked[label] ?? 0
                const live = alive[label] ?? 0
                const fin = finalized[label] ?? 0
                const verdict = live === 0 ? "collectible" : `RETAINED ${live}`
                return `  ${label.padEnd(28)} tracked ${String(total).padStart(5)}  finalized ${String(fin).padStart(5)}  ${verdict}`
            })

        return lines.join("\n")
    }
}

// Scrubbing
// ========================================

/**
 * Runs `work` a few times without tracking anything, then forces GC. The point is the last *tracked*
 * generation: V8 can keep it pinned through a stale register or an internal handle held by the loop that
 * just exited. Churning untracked objects over the same code paths displaces those, so a survivor
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
