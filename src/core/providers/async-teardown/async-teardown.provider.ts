export type CleanupFn = () => void | Promise<void>

type TeardownEntry = {
    id: number
    cleanup: CleanupFn
    priority: number
}

export class AsyncTeardown {
    private readonly entries = new Map<number, TeardownEntry>()
    private nextId = 1
    private runningPromise: Promise<void> | null = null

    add(cleanup: CleanupFn, priority = 0): () => void {
        const id = this.nextId++
        const entry: TeardownEntry = {
            id,
            cleanup,
            priority,
        }
        this.entries.set(id, entry)

        return () => {
            this.entries.delete(id)
        }
    }

    run(): Promise<void> {
        if (this.runningPromise) {
            return this.runningPromise
        }

        this.runningPromise = this.execute()
        return this.runningPromise
    }

    private async execute(): Promise<void> {
        const snapshot = Array.from(this.entries.values()).sort((a, b) => b.priority - a.priority)

        for (const entry of snapshot) {
            this.entries.delete(entry.id)
        }

        const groups = groupByPriority(snapshot)

        for (const group of groups) {
            // eslint-disable-next-line no-await-in-loop
            await Promise.all(group.map((entry) => this.invokeCleanup(entry.cleanup)))
        }
    }

    private async invokeCleanup(cleanup: CleanupFn): Promise<void> {
        try {
            await cleanup()
        } catch (error) {
            console.error("asyncTeardown.run", error)
        }
    }
}

function groupByPriority(snapshot: TeardownEntry[]): TeardownEntry[][] {
    const groups: TeardownEntry[][] = []
    let currentPriority: number | null = null
    let currentGroup: TeardownEntry[] = []

    for (const entry of snapshot) {
        if (currentPriority === null || currentPriority === entry.priority) {
            currentPriority = entry.priority
            currentGroup.push(entry)
            continue
        }

        groups.push(currentGroup)
        currentPriority = entry.priority
        currentGroup = [entry]
    }

    if (currentGroup.length) {
        groups.push(currentGroup)
    }

    return groups
}
