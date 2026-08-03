import { autorun, isAction, isComputedProp, isObservableProp, runInAction } from "mobx"
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

// Repeated instantiation
// ========================================

// Regression pin for the cached-annotation-map bug: the applicable subset used to be re-derived with
// `for...in`, which skips non-enumerable members. Prototype methods and getters are non-enumerable, so
// from instance #2 onward every method silently lost its `action` annotation and its autoBind, while the
// observable fields kept working and made the store look healthy.
describe("makeInheritedAutoObservable: repeated instantiation", () => {
    it("keeps methods actions and bound on every instance, not just the first", () => {
        class VM {
            count = 0
            constructor() {
                makeInheritedAutoObservable(this, {}, { autoBind: true })
            }
            inc(): void {
                this.count++
            }
        }

        const observed = [1, 2, 3].map((instance) => {
            const vm = new VM()
            const detached = vm.inc
            let threw: string | null = null
            try {
                detached()
            } catch (error) {
                threw = String(error)
            }
            return {
                instance,
                isAction: isAction(vm.inc),
                isBound: Object.prototype.hasOwnProperty.call(vm, "inc"),
                threw,
                count: vm.count,
            }
        })

        expect(observed).toEqual([
            { instance: 1, isAction: true, isBound: true, threw: null, count: 1 },
            { instance: 2, isAction: true, isBound: true, threw: null, count: 1 },
            { instance: 3, isAction: true, isBound: true, threw: null, count: 1 },
        ])
    })

    it("keeps getters computed on every instance", () => {
        class VM {
            count = 1
            constructor() {
                makeInheritedAutoObservable(this)
            }
            get doubled(): number {
                return this.count * 2
            }
        }

        const instances = [new VM(), new VM(), new VM()]

        expect(instances.map((vm) => isComputedProp(vm, "doubled"))).toEqual([true, true, true])
    })

    it("keeps both inheritance levels annotated on every instance", () => {
        class VM extends PlainBase {
            count = 1
            constructor() {
                super()
                makeInheritedAutoObservable(this, {}, { autoBind: true })
            }
            get doubled(): number {
                return this.count * 2
            }
            inc(): void {
                this.count++
            }
        }

        const observed = [1, 2, 3].map(() => {
            const vm = new VM()
            const detachedDerived = vm.inc
            const detachedBase = vm.fromBase

            detachedDerived()

            return {
                ownField: isObservableProp(vm, "count"),
                inheritedField: isObservableProp(vm, "inherited"),
                ownGetter: isComputedProp(vm, "doubled"),
                ownMethodIsAction: isAction(vm.inc),
                inheritedMethodIsAction: isAction(vm.fromBase),
                detachedDerivedResult: vm.count,
                detachedBaseResult: detachedBase(),
                doubled: vm.doubled,
            }
        })

        const expected = {
            ownField: true,
            inheritedField: true,
            ownGetter: true,
            ownMethodIsAction: true,
            inheritedMethodIsAction: true,
            detachedDerivedResult: 2,
            detachedBaseResult: "base",
            doubled: 4,
        }
        expect(observed).toEqual([expected, expected, expected])
    })

    it("still honours a false override on later instances", () => {
        class VM extends PlainBase {
            count = 1
            plain = "not observable"
            constructor() {
                super()
                makeInheritedAutoObservable(this, { plain: false })
            }
        }

        const instances = [new VM(), new VM(), new VM()]

        expect(instances.map((vm) => isObservableProp(vm, "count"))).toEqual([true, true, true])
        expect(instances.map((vm) => isObservableProp(vm, "plain"))).toEqual([false, false, false])
    })

    it("does not annotate a member the later instance lacks", () => {
        class VM {
            declare optional?: string
            count = 0
            constructor(withOptional: boolean) {
                if (withOptional) this.optional = "present"
                makeInheritedAutoObservable(this)
            }
        }

        const first = new VM(true)
        const second = new VM(false)

        expect(isObservableProp(first, "optional")).toBe(true)
        expect(isObservableProp(second, "optional")).toBe(false)
        expect(isObservableProp(second, "count")).toBe(true)
    })
})

// Cache scoping across inheritance levels
// ========================================

// Regression pin for the second cached-annotation-map bug, independent of the `for...in` one above. The
// map is written with `defineProperty` on the instance's OWN prototype, but used to be read back with a
// plain property access, which walks the prototype chain. So once an ancestor had been instantiated, a
// subclass found the ancestor's map, treated it as its own, and never derived its own annotations: the
// subclass's own methods lost `action` and autoBind, and its own getters lost `computed`. Same silent
// signature as the first bug -- the base members kept working, so the store looked healthy.
//
// The pattern under test is the one that makes both levels reachable: the BASE constructor calls the
// helper, and subclasses inherit that call. A subclass cannot call it again -- the second call throws on
// the `isObservable` guard.
//
// Note on fields: a subclass's OWN fields are never observable in this pattern, in either instantiation
// order. `derived = x` initializes only after `super()` returns, so it is not yet an own property when
// the helper runs inside the base constructor. That is JS class-field ordering, not this bug, and the
// assertions below pin it as-is so the two orders stay provably identical.
describe("makeInheritedAutoObservable: cache scoping across inheritance levels", () => {
    interface TwoLevel {
        baseField: string
        derivedField: string
        baseMethod: () => string
        derivedMethod: () => string
        readonly baseDoubled: string
        readonly derivedDoubled: string
    }

    const inspect = (vm: TwoLevel) => ({
        baseFieldObservable: isObservableProp(vm, "baseField"),
        derivedFieldObservable: isObservableProp(vm, "derivedField"),
        baseMethodIsAction: isAction(vm.baseMethod),
        derivedMethodIsAction: isAction(vm.derivedMethod),
        baseGetterIsComputed: isComputedProp(vm, "baseDoubled"),
        derivedGetterIsComputed: isComputedProp(vm, "derivedDoubled"),
        derivedMethodIsBound: Object.prototype.hasOwnProperty.call(vm, "derivedMethod"),
        detachedDerivedResult: (0, vm.derivedMethod)(),
        detachedBaseResult: (0, vm.baseMethod)(),
    })

    // The two orders must agree on every entry. Pre-fix, base-first lost the derived-only entries.
    const expectedForDerived = {
        baseFieldObservable: true,
        derivedFieldObservable: false,
        baseMethodIsAction: true,
        derivedMethodIsAction: true,
        baseGetterIsComputed: true,
        derivedGetterIsComputed: true,
        derivedMethodIsBound: true,
        detachedDerivedResult: "derived",
        detachedBaseResult: "base",
    }

    class BaseOne {
        baseField = "base"
        constructor() {
            makeInheritedAutoObservable(this, {}, { autoBind: true })
        }
        baseMethod(): string {
            return this.baseField
        }
        get baseDoubled(): string {
            return this.baseField + this.baseField
        }
    }

    class DerivedOne extends BaseOne {
        derivedField = "derived"
        derivedMethod(): string {
            return "derived"
        }
        get derivedDoubled(): string {
            return this.derivedMethod() + this.derivedMethod()
        }
    }

    class BaseTwo {
        baseField = "base"
        constructor() {
            makeInheritedAutoObservable(this, {}, { autoBind: true })
        }
        baseMethod(): string {
            return this.baseField
        }
        get baseDoubled(): string {
            return this.baseField + this.baseField
        }
    }

    class DerivedTwo extends BaseTwo {
        derivedField = "derived"
        derivedMethod(): string {
            return "derived"
        }
        get derivedDoubled(): string {
            return this.derivedMethod() + this.derivedMethod()
        }
    }

    it("derives the subclass's own annotations when the base was instantiated first", () => {
        const base = new BaseOne()
        const derived = new DerivedOne()

        expect(inspect(derived)).toEqual(expectedForDerived)

        expect({
            baseFieldObservable: isObservableProp(base, "baseField"),
            baseMethodIsAction: isAction(base.baseMethod),
            baseGetterIsComputed: isComputedProp(base, "baseDoubled"),
            detachedBaseResult: (0, base.baseMethod)(),
        }).toEqual({
            baseFieldObservable: true,
            baseMethodIsAction: true,
            baseGetterIsComputed: true,
            detachedBaseResult: "base",
        })
    })

    it("gives the same result when the subclass was instantiated first", () => {
        const derived = new DerivedTwo()
        const base = new BaseTwo()

        expect(inspect(derived)).toEqual(expectedForDerived)

        expect({
            baseFieldObservable: isObservableProp(base, "baseField"),
            baseMethodIsAction: isAction(base.baseMethod),
            baseGetterIsComputed: isComputedProp(base, "baseDoubled"),
            detachedBaseResult: (0, base.baseMethod)(),
        }).toEqual({
            baseFieldObservable: true,
            baseMethodIsAction: true,
            baseGetterIsComputed: true,
            detachedBaseResult: "base",
        })
    })

    it("annotates every level's own members in a three-level chain, whatever the order", () => {
        class Root {
            rootField = "root"
            constructor() {
                makeInheritedAutoObservable(this, {}, { autoBind: true })
            }
            rootMethod(): string {
                return "root"
            }
            get rootGetter(): string {
                return this.rootField
            }
        }

        class Mid extends Root {
            midMethod(): string {
                return "mid"
            }
            get midGetter(): string {
                return this.midMethod()
            }
        }

        class Leaf extends Mid {
            leafMethod(): string {
                return "leaf"
            }
            get leafGetter(): string {
                return this.leafMethod()
            }
        }

        // Mid before Root before Leaf: pre-fix, Leaf read Mid's cached map through the chain.
        const mid = new Mid()
        const root = new Root()
        const leaf = new Leaf()

        expect({
            rootField: isObservableProp(root, "rootField"),
            rootMethod: isAction(root.rootMethod),
            rootGetter: isComputedProp(root, "rootGetter"),
        }).toEqual({ rootField: true, rootMethod: true, rootGetter: true })

        expect({
            rootField: isObservableProp(mid, "rootField"),
            rootMethod: isAction(mid.rootMethod),
            rootGetter: isComputedProp(mid, "rootGetter"),
            midMethod: isAction(mid.midMethod),
            midGetter: isComputedProp(mid, "midGetter"),
            detachedMid: (0, mid.midMethod)(),
        }).toEqual({
            rootField: true,
            rootMethod: true,
            rootGetter: true,
            midMethod: true,
            midGetter: true,
            detachedMid: "mid",
        })

        expect({
            rootField: isObservableProp(leaf, "rootField"),
            rootMethod: isAction(leaf.rootMethod),
            rootGetter: isComputedProp(leaf, "rootGetter"),
            midMethod: isAction(leaf.midMethod),
            midGetter: isComputedProp(leaf, "midGetter"),
            leafMethod: isAction(leaf.leafMethod),
            leafGetter: isComputedProp(leaf, "leafGetter"),
            detachedLeaf: (0, leaf.leafMethod)(),
        }).toEqual({
            rootField: true,
            rootMethod: true,
            rootGetter: true,
            midMethod: true,
            midGetter: true,
            leafMethod: true,
            leafGetter: true,
            detachedLeaf: "leaf",
        })
    })

    it("composes with the repeated-instantiation guarantee: second instances stay fully annotated", () => {
        class Base {
            baseField = "base"
            constructor() {
                makeInheritedAutoObservable(this, {}, { autoBind: true })
            }
            baseMethod(): string {
                return this.baseField
            }
            get baseGetter(): string {
                return this.baseField
            }
        }

        class Derived extends Base {
            derivedMethod(): string {
                return "derived"
            }
            get derivedGetter(): string {
                return this.derivedMethod()
            }
        }

        new Base()
        new Derived()
        const secondBase = new Base()
        const secondDerived = new Derived()

        expect({
            baseField: isObservableProp(secondBase, "baseField"),
            baseMethod: isAction(secondBase.baseMethod),
            baseGetter: isComputedProp(secondBase, "baseGetter"),
            detached: (0, secondBase.baseMethod)(),
        }).toEqual({ baseField: true, baseMethod: true, baseGetter: true, detached: "base" })

        expect({
            baseField: isObservableProp(secondDerived, "baseField"),
            baseMethod: isAction(secondDerived.baseMethod),
            baseGetter: isComputedProp(secondDerived, "baseGetter"),
            derivedMethod: isAction(secondDerived.derivedMethod),
            derivedGetter: isComputedProp(secondDerived, "derivedGetter"),
            detached: (0, secondDerived.derivedMethod)(),
        }).toEqual({
            baseField: true,
            baseMethod: true,
            baseGetter: true,
            derivedMethod: true,
            derivedGetter: true,
            detached: "derived",
        })
    })
})
