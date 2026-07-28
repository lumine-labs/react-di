import { describe, expect, it } from "vitest"

import { Container, Inject, Injectable, decorate } from "../../src/container/index.js"
import type { Constructor } from "../../src/container/index.js"

// construct — build an UNREGISTERED class with injected deps, registering nothing.
// ========================================
//
// esbuild emits no `design:paramtypes`, so every constructor parameter is wired through an explicit
// `decorate(Inject(TOKEN), target, index)` — the same discipline the rest of the suite uses.

const DEP = Symbol("construct.dep")

describe("construct", () => {
    it("constructs a class with its constructor deps resolved from the container", () => {
        class Widget {
            constructor(readonly dep: string) {}
        }
        decorate(Injectable(), Widget)
        decorate(Inject(DEP) as ParameterDecorator, Widget as Constructor, 0)

        const container = new Container()
        container.register({ provide: DEP, useValue: "injected" })

        const widget = container.construct(Widget)

        expect(widget).toBeInstanceOf(Widget)
        expect(widget.dep).toBe("injected")
    })

    it("resolves deps through the ancestor chain", () => {
        class Widget {
            constructor(readonly dep: string) {}
        }
        decorate(Injectable(), Widget)
        decorate(Inject(DEP) as ParameterDecorator, Widget as Constructor, 0)

        const parent = new Container()
        parent.register({ provide: DEP, useValue: "from-parent" })
        const child = parent.fork()

        expect(child.construct(Widget).dep).toBe("from-parent")
    })

    it("returns a fresh instance on every call", () => {
        class Widget {
            static made = 0
            readonly seq = ++Widget.made
        }
        decorate(Injectable(), Widget)

        const container = new Container()

        const first = container.construct(Widget)
        const second = container.construct(Widget)

        expect(first).not.toBe(second)
        expect([first.seq, second.seq]).toEqual([1, 2])
    })

    it("registers nothing — the class stays unbound afterward", () => {
        class Widget {}
        decorate(Injectable(), Widget)

        const container = new Container()
        container.construct(Widget)

        expect(container.isRegistered(Widget)).toBe(false)
        // A second construct still works, proving no leftover binding to collide with.
        expect(container.construct(Widget)).toBeInstanceOf(Widget)
    })

    it("throws when a constructor dep is not registered anywhere in the chain", () => {
        const MISSING = Symbol("construct.missing")
        class Widget {
            constructor(readonly dep: string) {}
        }
        decorate(Injectable(), Widget)
        decorate(Inject(MISSING) as ParameterDecorator, Widget as Constructor, 0)

        const container = new Container()

        expect(() => container.construct(Widget)).toThrow(/No bindings found/)
    })
})
