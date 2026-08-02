import { autorun, isComputedProp, isObservableProp, runInAction } from "mobx"
import { describe, expect, it } from "vitest"

import { makeInheritedAutoObservable } from "../src/makeInheritedAutoObservable"

class PlainBase {
    inherited = "base"
    fromBase(): string {
        return this.inherited
    }
}

// Subclass support
// ========================================

describe("makeInheritedAutoObservable: subclass support", () => {
    it("annotates own and inherited members, which MobX's makeAutoObservable refuses to do", () => {
        class VM extends PlainBase {
            count = 1
            constructor() {
                super()
                makeInheritedAutoObservable(this)
            }
            get doubled(): number {
                return this.count * 2
            }
            inc(): void {
                this.count++
            }
        }

        const vm = new VM()

        expect(isObservableProp(vm, "count")).toBe(true)
        expect(isObservableProp(vm, "inherited")).toBe(true)
        expect(isComputedProp(vm, "doubled")).toBe(true)

        vm.inc()
        expect(vm.count).toBe(2)
        expect(vm.doubled).toBe(4)
    })

    it("reuses the cached annotation map for later instances of the same class", () => {
        class VM extends PlainBase {
            count = 1
            constructor() {
                super()
                makeInheritedAutoObservable(this)
            }
            inc(): void {
                this.count++
            }
        }

        const first = new VM()
        const second = new VM()

        first.inc()

        expect(isObservableProp(second, "count")).toBe(true)
        expect(second.count).toBe(1)
        expect(first.count).toBe(2)
    })

    it("honours overrides per key", () => {
        class VM extends PlainBase {
            count = 1
            plain = "not observable"
            constructor() {
                super()
                makeInheritedAutoObservable(this, { plain: false })
            }
        }

        const vm = new VM()

        expect(isObservableProp(vm, "count")).toBe(true)
        expect(isObservableProp(vm, "plain")).toBe(false)
    })

    it("binds methods when autoBind is on, so detached references still act", () => {
        class VM extends PlainBase {
            count = 0
            constructor() {
                super()
                makeInheritedAutoObservable(this, {}, { autoBind: true })
            }
            inc(): void {
                this.count++
            }
        }

        const vm = new VM()
        const detached = vm.inc

        detached()

        expect(vm.count).toBe(1)
    })

    it("keeps reactions on inherited fields alive", () => {
        class VM extends PlainBase {
            constructor() {
                super()
                makeInheritedAutoObservable(this)
            }
        }

        const vm = new VM()
        const seen: string[] = []
        const dispose = autorun(() => {
            seen.push(vm.inherited)
        })

        runInAction(() => {
            vm.inherited = "changed"
        })

        expect(seen).toEqual(["base", "changed"])
        dispose()
    })

    it("refuses a target that is already observable", () => {
        class VM extends PlainBase {
            count = 1
            constructor() {
                super()
                makeInheritedAutoObservable(this)
            }
        }

        const vm = new VM()

        expect(() => makeInheritedAutoObservable(vm)).toThrowError(/already observable/)
    })
})
