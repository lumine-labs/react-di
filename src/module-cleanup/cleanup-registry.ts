import type { CleanupFn, CleanupMode, CleanupOptions } from "./types.js"

export class CleanupRegistry {
    private readonly serialCleanups = new Set<CleanupFn>()
    private readonly deferredCleanups = new Set<CleanupFn>()

    add(cleanup: CleanupFn, options?: CleanupOptions): () => void {
        const mode: CleanupMode = options?.mode ?? "serial"
        const target = mode === "parallel" ? this.deferredCleanups : this.serialCleanups

        target.add(cleanup)
        return () => {
            target.delete(cleanup)
        }
    }

    async run(): Promise<void> {
        const deferredQueue = Array.from(this.deferredCleanups)
        const serialQueue = Array.from(this.serialCleanups).reverse()

        for (const cleanup of deferredQueue) {
            this.deferredCleanups.delete(cleanup)
        }
        for (const cleanup of serialQueue) {
            this.serialCleanups.delete(cleanup)
        }

        for (const cleanup of serialQueue) {
            // eslint-disable-next-line no-await-in-loop
            await this.invokeCleanup(cleanup)
        }

        await Promise.all(deferredQueue.map((cleanup) => this.invokeCleanup(cleanup)))
    }

    private async invokeCleanup(cleanup: CleanupFn): Promise<void> {
        try {
            await cleanup()
        } catch (error) {
            console.error("cleanup.run", error)
        }
    }
}
