import { describe, expect, it } from "vitest"

import { Token, makeTokenizer } from "../../src/utils/token.js"

describe("makeTokenizer", () => {
    it("creates isolated duplicate guards per tokenizer instance", () => {
        const tokenizeA = makeTokenizer("tests")
        const tokenizeB = makeTokenizer("tests")

        const tokenA = tokenizeA("Feature")
        const tokenB = tokenizeB("Feature")

        expect(tokenA).toBe(tokenB)
    })

    it("throws on duplicate token declarations inside the same tokenizer", () => {
        const tokenize = makeTokenizer("dup-check")
        tokenize("Service")

        expect(() => tokenize("Service")).toThrowError(/already declared/)
    })

    it("supports allowDuplicate for intentionally repeated declarations", () => {
        const tokenize = makeTokenizer("dup-opt-in")
        const first = tokenize("Service", { allowDuplicate: true })
        const second = tokenize("Service", { allowDuplicate: true })

        expect(first).toBe(second)
    })

    it("uses strict namespace bound to tokenizer instance", () => {
        const tokenizeA = makeTokenizer("ns-a")
        const tokenizeB = makeTokenizer("ns-b")

        const tokenA = tokenizeA("Shared")
        const tokenB = tokenizeB("Shared")

        expect(tokenA).not.toBe(tokenB)
    })

    it("keeps duplicate guards isolated even for same namespace", () => {
        const tokenizeA = makeTokenizer("shared-ns")
        const tokenizeB = makeTokenizer("shared-ns")

        const tokenA = tokenizeA("Service")
        expect(() => tokenizeA("Service")).toThrowError(/already declared/)

        const tokenB = tokenizeB("Service")
        expect(tokenB).toBe(tokenA)

        expect(() => tokenizeA("Service", { allowDuplicate: true })).not.toThrow()
    })
})

describe("Token", () => {
    it("remains backward compatible as a preconfigured tokenizer", () => {
        const uniqueName = `TokenCompat:${Date.now()}:${Math.random()}`
        Token(uniqueName)

        expect(() => Token(uniqueName)).toThrowError(/already declared/)
    })
})
