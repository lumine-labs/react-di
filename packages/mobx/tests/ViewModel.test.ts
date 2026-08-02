import { isObservableProp } from "mobx"
import { describe, expect, it, vi } from "vitest"

import { makeInheritedAutoObservable } from "../src/makeInheritedAutoObservable"
import { ViewModel } from "../src/ViewModel"

// Disposal
// ========================================

describe("ViewModel: disposal", () => {
    it("runs tracked disposers in reverse registration order", () => {
        const order: string[] = []

        class VM extends ViewModel {
            register(): void {
                this.track(() => order.push("first"))
                this.track(() => order.push("second"))
                this.track(() => order.push("third"))
            }
        }

        const vm = new VM()
        vm.register()
        vm.onModuleDestroy()

        expect(order).toEqual(["third", "second", "first"])
    })

    it("returns the disposer from track so it can wrap the call that produced it", () => {
        const disposer = (): void => {}

        class VM extends ViewModel {
            expose(): () => void {
                return this.track(disposer)
            }
        }

        expect(new VM().expose()).toBe(disposer)
    })

    it("runs an override before the tracked disposers, with no super call", () => {
        const order: string[] = []

        class VM extends ViewModel {
            register(): void {
                this.track(() => order.push("disposer"))
            }
            override onModuleDestroy(): void {
                order.push("override")
            }
        }

        const vm = new VM()
        vm.register()
        vm.onModuleDestroy()

        expect(order).toEqual(["override", "disposer"])
    })

    it("wraps an override declared without the `override` keyword", () => {
        const order: string[] = []

        // The keyword is erased at compile time; the wrapper is chosen by comparing the resolved method
        // against the base's, so both spellings behave identically.
        class VM extends ViewModel {
            register(): void {
                this.track(() => order.push("disposer"))
            }
            onModuleDestroy(): void {
                order.push("override")
            }
        }

        const vm = new VM()
        vm.register()
        vm.onModuleDestroy()

        expect(order).toEqual(["override", "disposer"])
    })

    it("tears down even when an override throws", () => {
        const dispose = vi.fn()
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

        class VM extends ViewModel {
            register(): void {
                this.track(dispose)
            }
            override onModuleDestroy(): void {
                throw new Error("override blew up")
            }
        }

        const vm = new VM()
        vm.register()

        expect(() => vm.onModuleDestroy()).toThrowError("override blew up")
        expect(dispose).toHaveBeenCalledTimes(1)

        consoleError.mockRestore()
    })

    it("stays idempotent when an override calls super as well", () => {
        const dispose = vi.fn()

        class VM extends ViewModel {
            register(): void {
                this.track(dispose)
            }
            override onModuleDestroy(): void {
                super.onModuleDestroy()
            }
        }

        const vm = new VM()
        vm.register()
        vm.onModuleDestroy()

        expect(dispose).toHaveBeenCalledTimes(1)
    })

    it("wraps nothing when the subclass does not override", () => {
        class VM extends ViewModel {}

        // The wrapper is only installed for overriding subclasses, so a plain view model keeps a clean
        // instance shape for the annotation walk.
        expect(Object.keys(new VM())).toEqual([])
    })

    it("isolates a throwing disposer so the rest still run", () => {
        const order: string[] = []
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

        class VM extends ViewModel {
            register(): void {
                this.track(() => order.push("survivor"))
                this.track(() => {
                    throw new Error("disposer blew up")
                })
            }
        }

        const vm = new VM()
        vm.register()
        vm.onModuleDestroy()

        expect(order).toEqual(["survivor"])
        expect(consoleError).toHaveBeenCalled()
        consoleError.mockRestore()
    })

    it("is safe to destroy twice", () => {
        const dispose = vi.fn()

        class VM extends ViewModel {
            register(): void {
                this.track(dispose)
            }
        }

        const vm = new VM()
        vm.register()
        vm.onModuleDestroy()
        vm.onModuleDestroy()

        expect(dispose).toHaveBeenCalledTimes(1)
    })
})

// Abort signal
// ========================================

describe("ViewModel: signal", () => {
    it("hands out one signal per instance and aborts it on destroy", () => {
        class VM extends ViewModel {
            expose(): AbortSignal {
                return this.signal()
            }
        }

        const vm = new VM()
        const signal = vm.expose()

        expect(signal).toBe(vm.expose())
        expect(signal.aborted).toBe(false)

        vm.onModuleDestroy()

        expect(signal.aborted).toBe(true)
    })

    it("aborts after an override runs, so a final request can still use the signal", () => {
        let abortedDuringOverride: boolean | null = null

        class VM extends ViewModel {
            override onModuleDestroy(): void {
                abortedDuringOverride = this.signal().aborted
            }
        }

        const vm = new VM()
        vm.onModuleDestroy()

        expect(abortedDuringOverride).toBe(false)
    })
})

// Interaction with makeInheritedAutoObservable
// ========================================

describe("ViewModel: observability", () => {
    class CounterVM extends ViewModel {
        count = 1

        constructor() {
            super()
            makeInheritedAutoObservable(this, {}, { autoBind: true })
        }

        inc(): void {
            this.count++
        }

        register(disposer: () => void): void {
            this.track(disposer)
        }
    }

    it("annotates subclass state while leaving the base's bookkeeping invisible", () => {
        const vm = new CounterVM()

        expect(isObservableProp(vm, "count")).toBe(true)
        // `#` private fields are unreachable by `Reflect.ownKeys`, so the annotation walk never sees the
        // disposer list or the abort controller.
        expect(Object.keys(vm)).toEqual(["count"])
    })

    it("keeps disposal working after the base's methods are annotated as actions", () => {
        const dispose = vi.fn()
        const vm = new CounterVM()

        vm.register(dispose)
        vm.inc()
        vm.onModuleDestroy()

        expect(vm.count).toBe(2)
        expect(dispose).toHaveBeenCalledTimes(1)
    })
})
