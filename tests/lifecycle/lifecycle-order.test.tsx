import { render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ModuleProvider } from "../../src/react/providers/ModuleProvider"
import type { ProviderLifecycle } from "../../src/core/providers/module-lifecycle/module-lifecycle.types.js"
import { Container } from "../../src/aliases/index.js"

const calls: string[] = []

class ServiceA implements ProviderLifecycle {
    onModuleInit() {
        calls.push("A:init")
    }
    onModuleMount() {
        calls.push("A:mount")
    }
    onModuleUnmount() {
        calls.push("A:unmount")
    }
    onModuleDestroy() {
        calls.push("A:destroy")
    }
}

class ServiceB implements ProviderLifecycle {
    onModuleInit() {
        calls.push("B:init")
    }
    onModuleMount() {
        calls.push("B:mount")
    }
    onModuleUnmount() {
        calls.push("B:unmount")
    }
    onModuleDestroy() {
        calls.push("B:destroy")
    }
}

class FailingInitService implements ProviderLifecycle {
    onModuleInit() {
        throw new Error("provider init failed")
    }
}

describe("module lifecycle order", () => {
    beforeEach(() => {
        calls.length = 0
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("uses module-first FIFO for init/mount and LIFO for unmount/destroy", async () => {
        const view = render(
            <ModuleProvider
                root
                providers={[ServiceA, ServiceB]}
                onModuleInit={() => calls.push("module:init")}
                onModuleMount={() => calls.push("module:mount")}
                onModuleUnmount={() => calls.push("module:unmount")}
                onModuleDestroy={() => calls.push("module:destroy")}
            >
                <div />
            </ModuleProvider>
        )

        expect(calls).toEqual(["module:init", "A:init", "B:init", "module:mount", "A:mount", "B:mount"])

        // Unmount is part of the deferred tree teardown (unmount → destroy → dispose run
        // together in the microtask flush), so nothing tears down until the flush drains.
        view.unmount()
        await vi.runAllTimersAsync()

        expect(calls).toEqual([
            "module:init",
            "A:init",
            "B:init",
            "module:mount",
            "A:mount",
            "B:mount",
            "B:unmount",
            "A:unmount",
            "module:unmount",
            "B:destroy",
            "A:destroy",
            "module:destroy",
        ])
    })

    it("rejects lifecycle hooks in inherit mode", () => {
        const onModuleInit = vi.fn()
        const onModuleMount = vi.fn()
        const onModuleUnmount = vi.fn()
        const onModuleDestroy = vi.fn()

        const inherited = Container.createChildContainer()

        expect(() =>
            render(
                <ModuleProvider
                    {...({
                        container: inherited,
                        onModuleInit,
                        onModuleMount,
                        onModuleUnmount,
                        onModuleDestroy,
                    } as any)}
                >
                    <div />
                </ModuleProvider>
            )
        ).toThrowError(/not allowed when inheriting from a container/)
    })

    it("rejects rebuildOn in inherit mode", () => {
        const inherited = Container.createChildContainer()

        expect(() =>
            render(
                <ModuleProvider
                    {...({
                        container: inherited,
                        rebuildOn: [1],
                    } as any)}
                >
                    <div />
                </ModuleProvider>
            )
        ).toThrowError(/not allowed when inheriting from a container/)
    })

    it("disposes owned container when provider init lifecycle throws", () => {
        const disposeSpy = vi.fn()
        const factory = () => {
            const container = Container.createChildContainer()
            vi.spyOn(container, "dispose").mockImplementation(disposeSpy as any)
            return container
        }

        expect(() =>
            render(
                <ModuleProvider factory={factory} providers={[FailingInitService]}>
                    <div />
                </ModuleProvider>
            )
        ).toThrowError("provider init failed")

        expect(disposeSpy).toHaveBeenCalled()
    })

    it("supports repeated provider tokens in FIFO/LIFO order", async () => {
        const MULTI = Symbol("MULTI")

        const first: ProviderLifecycle = {
            onModuleInit: () => calls.push("M1:init"),
            onModuleMount: () => calls.push("M1:mount"),
            onModuleUnmount: () => calls.push("M1:unmount"),
            onModuleDestroy: () => calls.push("M1:destroy"),
        }
        const second: ProviderLifecycle = {
            onModuleInit: () => calls.push("M2:init"),
            onModuleMount: () => calls.push("M2:mount"),
            onModuleUnmount: () => calls.push("M2:unmount"),
            onModuleDestroy: () => calls.push("M2:destroy"),
        }

        const view = render(
            <ModuleProvider
                root
                providers={[
                    { provide: MULTI, useValue: first },
                    { provide: MULTI, useValue: second },
                ]}
            >
                <div />
            </ModuleProvider>
        )

        expect(calls).toEqual(["M1:init", "M2:init", "M1:mount", "M2:mount"])

        // Unmount + destroy run together in the deferred flush.
        view.unmount()
        await vi.runAllTimersAsync()
        expect(calls).toEqual([
            "M1:init",
            "M2:init",
            "M1:mount",
            "M2:mount",
            "M2:unmount",
            "M1:unmount",
            "M2:destroy",
            "M1:destroy",
        ])
    })
})
