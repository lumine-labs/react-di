import { autorun, isObservable, reaction } from "mobx"
import { describe, expect, it } from "vitest"

import { mobxProps } from "../src/mobxProps"

// create()
// ========================================

describe("mobxProps: create", () => {
    it("mints an observable snapshot of the initial props, once", () => {
        const adapter = mobxProps<{ a: number }>()
        const target = adapter.create({ a: 1 })

        expect(isObservable(target)).toBe(true)
        expect(target).toEqual({ a: 1 })
    })

    it("keeps nested prop values un-proxied (shallow, not deep)", () => {
        const nested = { count: 1 }
        const adapter = mobxProps<{ nested: typeof nested }>()
        const target = adapter.create({ nested })

        // Same reference back => the nested value was never converted into its own observable proxy.
        expect(target.nested).toBe(nested)
    })
})

// update()
// ========================================

describe("mobxProps: update", () => {
    it("mutates the same instance in place and returns that exact reference", () => {
        const adapter = mobxProps<{ a: number; b: string }>()
        const target = adapter.create({ a: 1, b: "x" })

        const result = adapter.update({ current: target, next: { a: 2, b: "y" } })

        expect(result).toBe(target)
        expect(target).toEqual({ a: 2, b: "y" })
    })

    it("keeps an autorun tracking the same field alive across an update", () => {
        const adapter = mobxProps<{ count: number }>()
        const target = adapter.create({ count: 1 })

        const seen: number[] = []
        const dispose = autorun(() => {
            seen.push(target.count)
        })
        expect(seen).toEqual([1])

        const result = adapter.update({ current: target, next: { count: 2 } })

        expect(result).toBe(target)
        expect(seen).toEqual([1, 2])

        dispose()
    })

    it("drops props that disappeared from the next object", () => {
        const adapter = mobxProps<{ a: number; b?: string }>()
        const target = adapter.create({ a: 1, b: "x" })

        const seen: (string | undefined)[] = []
        const dispose = autorun(() => {
            seen.push(target.b)
        })

        adapter.update({ current: target, next: { a: 1 } })

        // `set` alone never deletes: `b` would keep "x" forever once the parent stops passing it.
        expect("b" in target).toBe(false)
        expect(seen).toEqual(["x", undefined])

        dispose()
    })

    it("keeps a reaction tracking the same field alive across an update", () => {
        const adapter = mobxProps<{ count: number }>()
        const target = adapter.create({ count: 1 })

        const seen: number[] = []
        const dispose = reaction(
            () => target.count,
            (count) => seen.push(count)
        )

        adapter.update({ current: target, next: { count: 2 } })
        adapter.update({ current: target, next: { count: 3 } })

        expect(seen).toEqual([2, 3])

        dispose()
    })
})
