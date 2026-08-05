import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

// The published surface.
// ========================================
//
// `stripInternal` in tsconfig.build.json is what keeps `@internal` members out of the emitted `.d.ts`, and
// a flag nobody checks is a flag that gets dropped in a config tidy-up. Nothing on the public class carries
// the tag any more — `onPredicateResolution` was the last one; it merged into `onResolution` as an optional
// predicate and the predicate has since gone entirely. What still carries it is `frame.ts`'s
// `activeFrame`/`runInFrame`, so those two are what the flag is pinned by now. This compiles the real build
// config into a throwaway directory and reads
// the declarations it produced, so the pin costs nothing that `pnpm run build` does not already do.

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..")

let outDir: string
const declaration = (path: string): string => readFileSync(join(outDir, path), "utf8")

beforeAll(() => {
    outDir = mkdtempSync(join(tmpdir(), "remodulo-container-dts-"))

    execFileSync(
        process.execPath,
        [
            join(packageRoot, "node_modules", "typescript", "bin", "tsc"),
            "-p",
            "tsconfig.build.json",
            "--outDir",
            outDir,
        ],
        { cwd: packageRoot, stdio: "pipe" }
    )
}, 180_000)

afterAll(() => {
    if (outDir) rmSync(outDir, { recursive: true, force: true })
})

describe("emitted declarations", () => {
    it("publishes one observation door, and it takes exactly two parameters", () => {
        // The whole signature, because the arity is the point: there is no attach-time filter beside the
        // listener, and the listener's second argument is the entry's snapshot — which is what makes
        // filtering inside the listener the equivalent it is.
        expect(declaration("container.d.ts")).toContain(
            "onResolution<T>(token: InjectionToken<T>, onResolved: (value: T, snapshot: BindingEntrySnapshot<T>) => void): void;"
        )
    })

    it("has no onPredicateResolution left to strip", () => {
        // It used to be `@internal` and stripped from the emitted `.d.ts`. It is now gone from the SOURCE,
        // which is the stronger claim and the one worth pinning — an internal door that does not exist
        // cannot drift back into the published surface through a config change.
        expect(readFileSync(join(packageRoot, "src", "container.ts"), "utf8")).not.toContain("onPredicateResolution")
        expect(declaration("container.d.ts")).not.toContain("onPredicateResolution")
    })

    it("strips the frame plumbing while keeping the injection functions", () => {
        // The frame's runtime is its own module now, so the two `@internal` functions are pinned where they
        // are declared and the injection surface is pinned where it is declared.
        const frame = declaration("frame.d.ts")
        const injector = declaration("injector.d.ts")

        expect(frame).not.toContain("activeFrame")
        expect(frame).not.toContain("runInFrame")
        for (const exported of ["inject", "injectOptional", "injectAll", "injectContainer", "runInInjectionContext"]) {
            expect(injector).toContain(`declare function ${exported}`)
        }
    })

    it("publishes injectContainer as a no-argument reader returning the Container itself", () => {
        // The signature is the whole surface here, and both halves of it matter: no parameters, because
        // the frame's anchor is not something a caller selects, and `Container` rather than
        // `Container | null`, because absence is the throw pinned in
        // `tests/injection/inject-container.test.ts` and never a return value.
        expect(declaration("injector.d.ts")).toContain("declare function injectContainer(): Container;")
        expect(declaration("index.d.ts")).toContain("injectContainer")
    })

    it("emits the two entry points the package exports", () => {
        expect(declaration("index.d.ts")).toContain('export { Container } from "./container.js"')
        expect(declaration("types.d.ts")).toContain("InjectionToken")
    })

    it("no longer publishes the feature and resolver surface", () => {
        const index = declaration("index.d.ts")
        const types = declaration("types.d.ts")

        for (const gone of ["Resolver", "createFeature", "flattenProviders"]) expect(index).not.toContain(gone)
        for (const gone of ["Feature", "ProviderInput"]) expect(types).not.toContain(gone)
    })

    it("publishes the metadata plane: EntrySnapshot, its two arms, and the accessors that hand it out", () => {
        const container = declaration("container.d.ts")
        const containerTypes = declaration("container.types.d.ts")
        const types = declaration("types.d.ts")

        // The union AND both arms are published, because the arms are not an implementation detail of it:
        // `onResolution`'s listener is declared over `BindingEntrySnapshot`, so a consumer writing a named
        // listener instead of an inline arrow has to be able to spell the parameter's type.
        expect(containerTypes).toContain("export type EntrySnapshot")
        expect(containerTypes).toContain("export type BindingEntrySnapshot")
        expect(containerTypes).toContain("export type AliasEntrySnapshot")
        for (const published of ["EntrySnapshot", "BindingEntrySnapshot", "AliasEntrySnapshot"]) {
            expect(types).toContain(published)
        }

        expect(container).toContain("get parent(): Container | null")
        expect(container).toContain("entry(token: InjectionToken): EntrySnapshot | undefined")
        expect(container).toContain("entries(token: InjectionToken): readonly EntrySnapshot[]")
        expect(container).toContain("registrations(): readonly EntrySnapshot[]")
    })

    it("publishes no `RegistrationKind`, now that the arms carry the union inline", () => {
        // Owner ruling: it was a public alias with nothing left referring to it. `EntrySnapshot` inlined the
        // `kind` union into its arms when it replaced `Registration`, so the alias named nothing the arms
        // did not already say — and a public type with no referent is surface to maintain for free.
        for (const file of ["container.types.d.ts", "types.d.ts", "index.d.ts"]) {
            expect(declaration(file)).not.toContain("RegistrationKind")
        }
    })

    it("keeps the container's internal types off both entry points", () => {
        // `Entry`, `EntrySource`, `EntryListener`, `Resolution` and `Found` moved out of `container.ts` into
        // `container.types.ts`, so that file carries behaviour and this one carries shape. They are
        // `export`ed there for that one importer, and `container.types.d.ts` therefore names them — which is
        // consumer-unreachable, because `package.json#exports` publishes `.` and `./types` and NOTHING else.
        // So the claim worth pinning is per entry point, not per file.
        //
        // Word-boundary matches, because `EntrySnapshot`, `BindingEntrySnapshot`, `EntryListener` and
        // `RegistrationMode` all legitimately contain these as substrings. `Registration` rides along: it
        // was the old snapshot type `EntrySnapshot` replaced, and two shapes for one thing is what the
        // collapse removed.
        const internals = ["Entry", "EntrySource", "EntryListener", "Resolution", "Found", "Registration"]

        for (const file of ["types.d.ts", "index.d.ts"]) {
            for (const internal of internals) {
                expect(declaration(file)).not.toMatch(new RegExp(`\\b${internal}\\b`))
            }
        }

        // The counterweight: they really did move, rather than being deleted or left behind in `container.ts`.
        const containerTypes = declaration("container.types.d.ts")
        for (const internal of ["Entry", "EntrySource", "EntryListener", "Resolution", "Found"]) {
            expect(containerTypes).toMatch(new RegExp(`export type ${internal}\\b`))
        }
        expect(declaration("container.d.ts")).not.toMatch(/\bEntry\b/)
    })

    it("publishes `EntryMetadata` and the snapshot field that carries it, on both arms", () => {
        // The extension point is public surface on both planes: a consumer writes the bag on a provider and
        // reads it back off a snapshot, so the type has to be spellable from `./types` and the field has to
        // be visible on the arm it will be read from — including the alias arm, which carries no scope but
        // does carry metadata.
        const providerTypes = declaration("providers.types.d.ts")
        const containerTypes = declaration("container.types.d.ts")

        expect(providerTypes).toContain("export type EntryMetadata = Readonly<Record<string, unknown>>;")
        expect(declaration("types.d.ts")).toContain("EntryMetadata")

        // The grammar side: every one of the five object forms takes the key.
        expect(providerTypes.match(/metadata\?: EntryMetadata;/g)).toHaveLength(5)

        // The snapshot side: one occurrence per arm, and the arms are what `EntrySnapshot` is built from.
        for (const arm of ["BindingEntrySnapshot", "AliasEntrySnapshot"]) {
            const declared = containerTypes.slice(containerTypes.indexOf(`export type ${arm}`))
            expect(declared.slice(0, declared.indexOf("};"))).toContain("readonly metadata?: EntryMetadata;")
        }
    })

    it("keeps the metadata bag off the kernel's own published signatures", () => {
        // `EntryMetadata` reaches `container.d.ts` through nothing: `register` takes `Provider`, the reads
        // return `EntrySnapshot`, and the copy/freeze lives in a module-local helper and a `#private` method.
        // The container names the type nowhere a consumer can see, which is the shape of "stores, never reads".
        expect(declaration("container.d.ts")).not.toContain("EntryMetadata")
    })

    it("publishes the four error classes with their structured fields", () => {
        // EntrySnapshot-style placement: declared next to the concept they belong to — the container's
        // three in `container.errors.d.ts`, the injector's one in `injector.errors.d.ts` — and reachable
        // from both entry points. The FIELDS are the reason the classes are published at all, so they are
        // pinned with their declared types: a consumer branching on `code` or reading `chain` writes
        // against these, and widening `token` to `unknown` or `chain` to `unknown[]` would be a silent
        // downgrade that no message assertion would catch.
        const containerErrors = declaration("container.errors.d.ts")
        const injectorErrors = declaration("injector.errors.d.ts")

        expect(containerErrors).toContain("export declare class RegistrationError extends Error")
        expect(containerErrors).toContain("readonly token: InjectionToken | undefined;")

        expect(containerErrors).toContain("export declare class ResolutionError extends Error")
        expect(containerErrors).toContain("readonly token: InjectionToken;")
        expect(containerErrors).toContain("readonly mode: ResolveMode | ResolveAllMode | undefined;")

        // The subclass relation is the published one, not just a runtime fact.
        expect(containerErrors).toContain("export declare class CycleError extends ResolutionError")
        expect(containerErrors).toContain("readonly chain: readonly InjectionToken[];")

        expect(injectorErrors).toContain("export declare class InjectionContextError extends Error")
        expect(injectorErrors).toContain("readonly caller: string;")
    })

    it("types every code as a literal string, not as `string`", () => {
        // A `code` widened to `string` is a discriminant that no longer discriminates: the union it is
        // meant to narrow stops narrowing and the compiler stops catching a typo'd comparison. The four
        // constants and the three concrete classes carry the literal; `ResolutionError.code` is the union
        // of the two literal-typed constants, because a caught `ResolutionError` may be a `CycleError`.
        const containerErrors = declaration("container.errors.d.ts")
        const injectorErrors = declaration("injector.errors.d.ts")

        expect(containerErrors).toContain('export declare const REGISTRATION_ERROR_CODE = "REMODULO/REGISTRATION";')
        expect(containerErrors).toContain('export declare const RESOLUTION_ERROR_CODE = "REMODULO/RESOLUTION";')
        expect(containerErrors).toContain('export declare const CYCLE_ERROR_CODE = "REMODULO/CYCLE";')
        expect(injectorErrors).toContain(
            'export declare const INJECTION_CONTEXT_ERROR_CODE = "REMODULO/INJECTION_CONTEXT";'
        )

        expect(containerErrors).toContain('readonly code = "REMODULO/REGISTRATION";')
        expect(containerErrors).toContain('readonly code = "REMODULO/CYCLE";')
        expect(injectorErrors).toContain('readonly code = "REMODULO/INJECTION_CONTEXT";')
        expect(containerErrors).toContain("readonly code: typeof RESOLUTION_ERROR_CODE | typeof CYCLE_ERROR_CODE;")
    })

    it("reaches the classes and the codes from both entry points", () => {
        const index = declaration("index.d.ts")
        const types = declaration("types.d.ts")

        // Values on `.`: a `catch` branch needs the constructor and the code to compare against.
        for (const published of [
            "RegistrationError",
            "ResolutionError",
            "CycleError",
            "REGISTRATION_ERROR_CODE",
            "RESOLUTION_ERROR_CODE",
            "CYCLE_ERROR_CODE",
        ]) {
            expect(index).toContain(published)
        }
        expect(index).toContain("InjectionContextError")
        expect(index).toContain("INJECTION_CONTEXT_ERROR_CODE")

        // Types on `./types`: the instance types, for a consumer annotating a caught value.
        expect(types).toContain(
            'export type { CycleError, RegistrationError, ResolutionError } from "./container.errors.js"'
        )
        expect(types).toContain('export type { InjectionContextError } from "./injector.errors.js"')
    })

    it("publishes describeToken as a value, with the signature the errors use it through", () => {
        // It renders every token an error message names; the layer above needs the same rendering rather
        // than a copy of it, so it is a published function and its one-argument shape is the surface.
        expect(declaration("utils/describeToken.d.ts")).toContain(
            "export declare function describeToken(token: InjectionToken): string;"
        )
        expect(declaration("index.d.ts")).toContain('export { describeToken } from "./utils/describeToken.js"')
    })

    it("publishes a provider grammar with no `lazy`", () => {
        // Owner ruling: lazy/eager is lifecycle policy, not container semantics. The field belongs to the
        // module layer, and the emitted grammar is what a consumer is offered.
        expect(declaration("providers.types.d.ts")).not.toContain("lazy")
        expect(declaration("container.types.d.ts")).not.toContain("lazy")
    })
})
