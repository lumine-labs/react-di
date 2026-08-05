import { describe, expect, it } from "vitest"

import { Container } from "../../src/container.js"
import { Token } from "../../src/tokenizer.js"
import { describeToken } from "../../src/utils/describeToken.js"

// describeToken, now public.
// ========================================
//
// It was already the thing every error message names a token with; it is exported because the layer above
// needs the SAME rendering for its own diagnostics, and a copy of it there drifts the moment either side
// changes. So the claim worth pinning is not "it returns these strings" — that would be the copy again,
// written as an assertion — but "what it returns is what an error message shows". The expected value is
// therefore CAPTURED out of a real throw rather than typed in beside it.

/** The token as the `notRegistered` message renders it, cut back out of the message. */
function renderedByAnError(token: Parameters<typeof describeToken>[0]): string {
    try {
        new Container().resolve(token)
    } catch (error) {
        const { message } = error as Error
        return message.slice("Token ".length, message.indexOf(" is not registered"))
    }
    throw new Error("resolve was supposed to throw")
}

describe("describeToken", () => {
    it("renders every token kind the way an error message shows it", () => {
        class Service {}
        const symbolToken = Symbol("PLUGINS")
        const tokenizerToken = Token("describe-token.probe")

        for (const token of [Service, symbolToken, tokenizerToken]) {
            expect(describeToken(token)).toBe(renderedByAnError(token))
        }

        // The captures above are only worth something if the three kinds render differently, so the
        // rendering itself is stated once — and it is the tokenizer's namespaced key, not the bare name.
        expect([describeToken(Service), describeToken(symbolToken), describeToken(tokenizerToken)]).toEqual([
            "Service",
            "PLUGINS",
            "@remodulo/container:describe-token.probe",
        ])
    })
})
