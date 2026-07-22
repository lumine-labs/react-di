import { afterEach, describe, expect, it, vi } from "vitest"
import type { DependencyContainer } from "../../src/aliases/index.js"
import type { ProviderLifecycle } from "../../src/core/providers/module-lifecycle/module-lifecycle.types.js"
import type { ModuleResolutionParams } from "../../src/core/module/resolution.types.js"
import { AsyncTeardown } from "../../src/core/providers/async-teardown/async-teardown.provider.js"
import { ModuleLifecycle } from "../../src/core/providers/module-lifecycle/module-lifecycle.provider.js"
import { createModuleResolution } from "../../src/core/module/resolution.js"

// Direct orchestrator tests — no React. Real containers wired exactly like useModule wires them, so the
// tree resolution (attach/cascade) exercises the real code path. commit()/scheduleTeardown() are driven
// manually to simulate React's commit/cleanup signals in whatever order we choose.

type Node = {
    lc: ModuleLifecycle
    container: DependencyContainer
}

function flush(): Promise<void> {
    // A macrotask drains the queueMicrotask flush and its entire async teardown chain.
    return new Promise((resolve) => setTimeout(resolve, 0))
}

function makeModule(
    parentContainer: DependencyContainer | null,
    label: string,
    log: string[],
    extra?: Partial<ModuleResolutionParams>
): Node {
    const params = {
        ...(parentContainer ? {} : { root: true as const }),
        ...extra,
    } as ModuleResolutionParams

    const resolution = createModuleResolution(parentContainer, params)
    const lc = resolution.container.resolve(ModuleLifecycle)
    // init(hooks) runs the eager provider pass + the INIT phase, as useModule wires it.
    lc.init({
        onModuleMount: () => log.push(`${label}:mount`),
        onModuleUnmount: () => log.push(`${label}:unmount`),
        onModuleDestroy: () => log.push(`${label}:destroy`),
    })
    return { lc, container: resolution.container }
}

describe("ModuleLifecycle orchestrator", () => {
    afterEach(async () => {
        // Drain any lingering scheduled teardowns so state never leaks between tests.
        await flush()
    })

    it("mounts parent-first even when commit arrives bottom-up (child before parent)", () => {
        const log: string[] = []
        const a = makeModule(null, "A", log)
        const b = makeModule(a.container, "B", log)
        const c = makeModule(b.container, "C", log)

        // React fires child effects first.
        c.lc.commit()
        b.lc.commit()
        a.lc.commit()

        expect(log).toEqual(["A:mount", "B:mount", "C:mount"])
    })

    it("mounts parent-first even when commit arrives top-down (parent before child)", () => {
        const log: string[] = []
        const a = makeModule(null, "A", log)
        const b = makeModule(a.container, "B", log)
        const c = makeModule(b.container, "C", log)

        // Hypothetical inverted order — the commit gate + self-mount keeps it parent-first.
        a.lc.commit()
        b.lc.commit()
        c.lc.commit()

        expect(log).toEqual(["A:mount", "B:mount", "C:mount"])
    })

    it("mounts siblings in commit order", () => {
        const log: string[] = []
        const p = makeModule(null, "P", log)
        const c1 = makeModule(p.container, "C1", log)
        const c2 = makeModule(p.container, "C2", log)

        c1.lc.commit()
        c2.lc.commit()
        p.lc.commit()

        expect(log).toEqual(["P:mount", "C1:mount", "C2:mount"])
    })

    it("tears down a whole tree in full reverse order regardless of cleanup order", async () => {
        const log: string[] = []
        const a = makeModule(null, "A", log)
        const b = makeModule(a.container, "B", log)
        const c = makeModule(b.container, "C", log)
        c.lc.commit()
        b.lc.commit()
        a.lc.commit()
        log.length = 0

        // Cleanups arrive bottom-up; the tree still destroys C → B → A.
        c.lc.scheduleTeardown()
        b.lc.scheduleTeardown()
        a.lc.scheduleTeardown()
        await flush()

        expect(log).toEqual([
            "C:unmount",
            "C:destroy",
            "B:unmount",
            "B:destroy",
            "A:unmount",
            "A:destroy",
        ])
    })

    it("mounts a dynamic child immediately when the parent is already mounted", () => {
        const log: string[] = []
        const p = makeModule(null, "P", log)
        p.lc.commit()
        expect(log).toEqual(["P:mount"])

        const c = makeModule(p.container, "C", log)
        c.lc.commit()

        expect(log).toEqual(["P:mount", "C:mount"])
    })

    it("tears down only the removed subtree, leaving the parent mounted", async () => {
        const log: string[] = []
        const p = makeModule(null, "P", log)
        const c = makeModule(p.container, "C", log)
        c.lc.commit()
        p.lc.commit()
        log.length = 0

        // Only the child unmounts.
        c.lc.scheduleTeardown()
        await flush()

        expect(log).toEqual(["C:unmount", "C:destroy"])
    })

    it("commit is idempotent — no double mount", () => {
        const log: string[] = []
        const p = makeModule(null, "P", log)
        p.lc.commit()
        p.lc.commit()
        expect(log).toEqual(["P:mount"])
    })

    it("resurrection: a re-commit before the flush cancels the scheduled teardown", async () => {
        const log: string[] = []
        const p = makeModule(null, "P", log)
        p.lc.commit()

        p.lc.scheduleTeardown()
        p.lc.commit() // resurrected before the microtask flush
        await flush()

        expect(log).toEqual(["P:mount"]) // never unmounted/destroyed
    })

    it("unmountTree is repeat-safe", async () => {
        const log: string[] = []
        const p = makeModule(null, "P", log)
        p.lc.commit()
        log.length = 0

        await p.lc.unmountTree()
        await p.lc.unmountTree()

        expect(log).toEqual(["P:unmount", "P:destroy"])
    })

    it("runs provider destroy hooks in LIFO order", async () => {
        const destroyed: string[] = []
        const provider = (name: string): ProviderLifecycle => ({
            onModuleDestroy: () => destroyed.push(name),
        })
        const S1 = Symbol("S1")
        const S2 = Symbol("S2")
        const S3 = Symbol("S3")

        const params: ModuleResolutionParams = {
            root: true,
            providers: [
                { provide: S1, useValue: provider("S1") },
                { provide: S2, useValue: provider("S2") },
                { provide: S3, useValue: provider("S3") },
            ],
        }
        const resolution = createModuleResolution(null, params)
        const lc = resolution.container.resolve(ModuleLifecycle)
        lc.init()

        lc.commit()
        await lc.unmountTree()

        expect(destroyed).toEqual(["S3", "S2", "S1"])
    })

    it("runs AsyncTeardown between unmount and destroy", async () => {
        const log: string[] = []
        const params: ModuleResolutionParams = {
            root: true,
            providers: [AsyncTeardown],
        }
        const resolution = createModuleResolution(null, params)
        const lc = resolution.container.resolve(ModuleLifecycle)
        lc.init({
            onModuleUnmount: () => log.push("unmount"),
            onModuleDestroy: () => log.push("destroy"),
        })

        resolution.container.resolve(AsyncTeardown).add(async () => {
            log.push("async-teardown")
        })

        lc.commit()
        await lc.unmountTree()

        expect(log).toEqual(["unmount", "async-teardown", "destroy"])
    })

    it("catches unmount-hook errors and still disposes", async () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
        const Boom = Symbol("Boom")
        const params: ModuleResolutionParams = {
            root: true,
            providers: [
                {
                    provide: Boom,
                    useValue: {
                        onModuleUnmount: () => {
                            throw new Error("unmount boom")
                        },
                    } as ProviderLifecycle,
                },
            ],
        }
        const resolution = createModuleResolution(null, params)
        const lc = resolution.container.resolve(ModuleLifecycle)
        lc.init()
        const disposeSpy = vi.spyOn(resolution.container, "dispose")

        lc.commit()
        await lc.unmountTree()

        expect(errorSpy).toHaveBeenCalled()
        expect(disposeSpy).toHaveBeenCalledTimes(1)
        errorSpy.mockRestore()
    })
})
