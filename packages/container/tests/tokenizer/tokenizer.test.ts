import { describe, expect, it } from "vitest"

import { Container } from "../../src/container.js"
import { makeTokenizer, Token } from "../../src/tokenizer.js"

// Tokens.
// ========================================
//
// A token is a symbol interned in the GLOBAL registry under `<namespace>:<name>`, so two copies of a package
// in one process still agree about what a token is. The duplicate guard is therefore not about identity — it
// is a per-tokenizer bookkeeping check that catches the same name being declared twice through the same
// factory, and nothing wider.

describe("Token", () => {
    it("returns a symbol interned under `<namespace>:<name>`", () => {
        const Tokenize = makeTokenizer("tests.tokenizer.interning")

        const token = Tokenize("service")

        expect(typeof token).toBe("symbol")
        expect((token as symbol).description).toBe("tests.tokenizer.interning:service")
        expect(token).toBe(Symbol.for("tests.tokenizer.interning:service"))
    })

    it("uses the @remodulo/container namespace for the default export", () => {
        const token = Token("tests.tokenizer.default-export")

        expect((token as symbol).description).toBe("@remodulo/container:tests.tokenizer.default-export")
        expect(token).toBe(Symbol.for("@remodulo/container:tests.tokenizer.default-export"))
    })

    it("defaults `makeTokenizer` to the same namespace", () => {
        const Tokenize = makeTokenizer()

        expect((Tokenize("tests.tokenizer.implicit-namespace") as symbol).description).toBe(
            "@remodulo/container:tests.tokenizer.implicit-namespace"
        )
    })
})

describe("duplicate names", () => {
    it("throws on a second declaration, naming the full key", () => {
        const Tokenize = makeTokenizer("tests.tokenizer.duplicates")
        Tokenize("repeated")

        expect(() => Tokenize("repeated")).toThrow(
            'Token: token "tests.tokenizer.duplicates:repeated" is already declared. Use a unique name/namespace or set { allowDuplicate: true }.'
        )
    })

    it("permits the duplicate under `allowDuplicate` and hands back the same interned symbol", () => {
        const Tokenize = makeTokenizer("tests.tokenizer.allow-duplicate")

        const first = Tokenize("shared")
        const second = Tokenize("shared", { allowDuplicate: true })

        expect(second).toBe(first)
        expect(second).toBe(Symbol.for("tests.tokenizer.allow-duplicate:shared"))
    })

    it("still records a name declared under `allowDuplicate`, so the next plain call throws", () => {
        const Tokenize = makeTokenizer("tests.tokenizer.allow-duplicate-records")

        Tokenize("recorded", { allowDuplicate: true })

        expect(() => Tokenize("recorded")).toThrow(
            'Token: token "tests.tokenizer.allow-duplicate-records:recorded" is already declared.'
        )
    })

    it("tracks declarations per tokenizer instance, not per namespace", () => {
        // Two factories over one namespace do NOT see each other: the guard is closure-local bookkeeping,
        // while identity comes from the global symbol registry. Same name, no throw, same symbol.
        const first = makeTokenizer("tests.tokenizer.per-instance")
        const second = makeTokenizer("tests.tokenizer.per-instance")

        const fromFirst = first("collides")
        const fromSecond = second("collides")

        expect(fromSecond).toBe(fromFirst)
        expect(() => second("collides")).toThrow(
            'Token: token "tests.tokenizer.per-instance:collides" is already declared.'
        )
    })
})

describe("name and namespace validation", () => {
    it("rejects an empty or whitespace-only name", () => {
        const Tokenize = makeTokenizer("tests.tokenizer.validation")

        expect(() => Tokenize("")).toThrow("Token: `name` must be a non-empty string.")
        expect(() => Tokenize("   \t\n ")).toThrow("Token: `name` must be a non-empty string.")
    })

    it("trims the name before interning and before the duplicate check", () => {
        const Tokenize = makeTokenizer("tests.tokenizer.trimming")

        const token = Tokenize("  padded  ")

        expect(token).toBe(Symbol.for("tests.tokenizer.trimming:padded"))
        expect(() => Tokenize("padded")).toThrow(
            'Token: token "tests.tokenizer.trimming:padded" is already declared.'
        )
    })

    it("falls back to the default namespace when the namespace is whitespace-only", () => {
        const Tokenize = makeTokenizer("   ")

        expect((Tokenize("tests.tokenizer.blank-namespace") as symbol).description).toBe(
            "@remodulo/container:tests.tokenizer.blank-namespace"
        )
    })
})

describe("end to end", () => {
    it("registers and resolves through a token from `makeTokenizer`", () => {
        const Tokenize = makeTokenizer("tests.tokenizer.e2e")
        const GREETING = Tokenize<string>("greeting")

        const container = new Container()
        container.register({ provide: GREETING, useValue: "hello" })

        expect(container.resolve<string>(GREETING)).toBe("hello")
        expect(container.isRegistered(GREETING)).toBe(true)
    })

    it("names the token by its full key in container errors", () => {
        const Tokenize = makeTokenizer("tests.tokenizer.errors")
        const MISSING = Tokenize("missing")

        expect(() => new Container().resolve(MISSING)).toThrow(
            "Token tests.tokenizer.errors:missing is not registered in this container or any ancestor."
        )
    })
})
