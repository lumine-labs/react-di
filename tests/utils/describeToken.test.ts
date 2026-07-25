import { describe, expect, it } from "vitest"
import { describeToken } from "../../src/shared/describeToken.js"
import { Token } from "../../src/core/tokenizer/tokenizer.js"

class ProductsStore {}

describe("describeToken", () => {
    it("renders a symbol token as Symbol(description)", () => {
        expect(describeToken(Symbol("API_URL"))).toBe("Symbol(API_URL)")
        expect(describeToken(Symbol.for("app:config"))).toBe("Symbol(app:config)")
        expect(describeToken(Symbol())).toBe("Symbol()")
    })

    it("renders a tokenizer token as its namespaced key", () => {
        expect(describeToken(Token("describeToken.ApiUrl"))).toBe("Symbol(@luminelabs/react-di:describeToken.ApiUrl)")
    })

    it("renders a class or function token as its name", () => {
        expect(describeToken(ProductsStore)).toBe("ProductsStore")
        expect(describeToken(function makeThing() {})).toBe("makeThing")
    })

    it("renders a string token as itself", () => {
        expect(describeToken("API_URL")).toBe("API_URL")
        expect(describeToken("")).toBe("")
    })

    it("falls back for nameless and exotic tokens without throwing", () => {
        // A class expression passed inline gets no inferred name.
        expect(describeToken(class {})).toBe("(anonymous)")
        expect(describeToken(42)).toBe("42")
        expect(describeToken(undefined)).toBe("undefined")

        // A description is built while an error is already being thrown — it must not throw itself.
        const hostile = {
            toString() {
                throw new Error("boom")
            },
        }
        expect(describeToken(hostile)).toBe("(unknown token)")
    })
})
