import { describe, expect, it } from "vitest"

import { Container } from "../../src/container.js"
import { inject, injectContainer, runInInjectionContext } from "../../src/injector.js"

// `injectContainer` — the hatch into the frame's own anchor.
// ========================================
//
// The other three readers hand back a VALUE from the frame's container. This one hands back the container
// itself, which is a different kind of thing: it is a read surface AND a registration surface, handed to a
// service at construction time.
//
// Everything else about it is the frame's ordinary contract, and that is the point of this file: it is a
// reader like the other three, so it obeys the declaring-container rule (§3), it lives exactly as long as
// the call stack that pushed the frame (§4), and outside one it throws rather than returning null.

const TOKEN = Symbol("TOKEN")

describe("which container comes back", () => {
    it("is the DECLARING container, not the one the read started from", () => {
        // THE pin. `Service` lives on the parent, so it constructs under a frame anchored at the parent
        // however deep the descendant that asked for it — and `injectContainer` reports that anchor, not
        // `child`. A version that reported the reading container would hand a parent-owned singleton a
        // reference to whichever child happened to build it first.
        let seen: Container | undefined
        class Service {
            constructor() {
                seen = injectContainer()
            }
        }

        const parent = new Container()
        parent.register(Service)
        const child = parent.fork()

        child.resolve(Service)

        expect(seen).toBe(parent)
        expect(seen).not.toBe(child)
    })

    it("is the descendant when the descendant is the one that declared the binding", () => {
        // The other half of the same rule: shadowing anchors at the shadow.
        class Service {
            readonly container = injectContainer()
        }

        const parent = new Container()
        const child = parent.fork()
        child.register(Service)

        expect(child.resolve(Service).container).toBe(child)
    })

    it("follows a useExisting alias to the TARGET's declaring container", () => {
        const ALIAS = Symbol("ALIAS")
        const TARGET = Symbol("TARGET")

        class Service {
            readonly container = injectContainer()
        }

        const root = new Container()
        root.register({ provide: TARGET, useClass: Service })
        const child = root.fork()
        child.register({ provide: ALIAS, useExisting: TARGET })

        expect(child.resolve<Service>(ALIAS).container).toBe(root)
    })
})

describe("the sites it works at", () => {
    it("works in a field initializer", () => {
        class Service {
            readonly container = injectContainer()
        }

        const container = new Container()
        container.register(Service)

        expect(container.resolve(Service).container).toBe(container)
    })

    it("works in a constructor body", () => {
        class Service {
            readonly container: Container
            constructor() {
                this.container = injectContainer()
            }
        }

        const container = new Container()
        container.register(Service)

        expect(container.resolve(Service).container).toBe(container)
    })

    it("works in a useFactory body", () => {
        const BUILT = Symbol("BUILT")

        const container = new Container()
        container.register({ provide: BUILT, useFactory: () => ({ container: injectContainer() }) })

        expect(container.resolve<{ container: Container }>(BUILT).container).toBe(container)
    })

    it("works under runInInjectionContext, returning the container it was passed", () => {
        const parent = new Container()
        const child = parent.fork()

        expect(runInInjectionContext(parent, () => injectContainer())).toBe(parent)
        expect(runInInjectionContext(child, () => injectContainer())).toBe(child)
    })

    it("works under Container.construct, returning the container it was called on", () => {
        class Unregistered {
            readonly container = injectContainer()
        }

        const parent = new Container()
        const child = parent.fork()

        expect(parent.construct(Unregistered).container).toBe(parent)
        expect(child.construct(Unregistered).container).toBe(child)
        expect(parent.isRegistered(Unregistered)).toBe(false)
    })
})

describe("outside a construction frame", () => {
    it("throws rather than returning null", () => {
        expect(() => injectContainer()).toThrow(/was called outside a construction frame/)
    })

    it("prints the same message the value readers print, with no token to name", () => {
        // It takes no token, so the call prints bare — `injectContainer()`, not `injectContainer(TOKEN)`.
        // The rest is the shared catalog entry verbatim, which is the point: one outside-the-frame
        // diagnosis for all four readers, covering all three ways to get here.
        const message = ((): string => {
            try {
                injectContainer()
                return ""
            } catch (error) {
                return (error as Error).message
            }
        })()

        expect(message.startsWith("injectContainer() was called outside a construction frame.")).toBe(true)
        expect(message).toMatch(/constructor body, a field initializer, or a `useFactory` body/)
        expect(message).toMatch(/BEFORE the first `await`/)
        expect(message).toMatch(/open a frame explicitly with `runInInjectionContext`/)
        expect(message).toMatch(/two copies of @remodulo\/container in one process/)
    })

    it("is gone again once the construction that opened the frame returns", () => {
        class Service {
            readonly container = injectContainer()
        }

        const container = new Container()
        container.register(Service)
        container.resolve(Service)

        expect(() => injectContainer()).toThrow(/outside a construction frame/)
    })
})

describe("the container it returns is the live one", () => {
    it("resolves what inject resolves, for a read in the same frame", () => {
        // Equivalent BY CONSTRUCTION, not by coincidence: `inject(TOKEN)` is
        // `frame.container.resolve(TOKEN, "nearest")`, and `injectContainer()` is that same
        // `frame.container` — so the two lines below are the same call spelled two ways, and the default
        // mode is `"nearest"` on both sides. The equivalence stops holding the moment the read leaves the
        // frame, which is what the whole file above is about.
        class Probe {
            readonly viaInject = inject<string>(TOKEN)
            readonly viaContainer = injectContainer().resolve<string>(TOKEN)
        }

        const container = new Container()
        container.register([{ provide: TOKEN, useValue: "value" }, Probe])

        const probe = container.resolve(Probe)
        expect(probe.viaContainer).toBe(probe.viaInject)
        expect(probe.viaContainer).toBe("value")
    })

    it("hands over the registration surface too, not just reads", () => {
        // The caveat, measured. This is a real container reference: a service that holds it can register
        // into its declaring container, which is more power than the value readers give out.
        const LATE = Symbol("LATE")
        class Installer {
            constructor() {
                injectContainer().register({ provide: LATE, useValue: "installed" })
            }
        }

        const container = new Container()
        container.register(Installer)
        container.resolve(Installer)

        expect(container.resolve(LATE)).toBe("installed")
    })

    it("exposes the anchor's own chain, parent included", () => {
        class Service {
            readonly container = injectContainer()
        }

        const parent = new Container()
        parent.register({ provide: TOKEN, useValue: "parent" })
        const child = parent.fork()
        child.register(Service)

        const seen = child.resolve(Service).container
        expect(seen.parent).toBe(parent)
        expect(seen.resolve(TOKEN)).toBe("parent")
    })
})
