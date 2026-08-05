import type { InjectionToken } from "./container.types.js"
import { describeToken } from "./utils/describeToken.js"

// Error code
// ========================================

export const INJECTION_CONTEXT_ERROR_CODE = "REMODULO/INJECTION_CONTEXT"

// Error class
// ========================================

/** A reader called outside a construction frame. */
export class InjectionContextError extends Error {
    readonly code = INJECTION_CONTEXT_ERROR_CODE
    readonly caller: string

    constructor(message: string, caller: string) {
        super(message)
        this.name = "InjectionContextError"
        this.caller = caller
    }
}

// Errors
// ========================================

export function notInInjectionContext(caller: string, token?: InjectionToken): string {
    const call = token === undefined ? `${caller}()` : `${caller}(${describeToken(token)})`
    return `${call} was called outside a construction frame. \`${caller}\` reads the container that is building right now, so it only works synchronously inside a constructor body, a field initializer, or a \`useFactory\` body. In an async factory that means BEFORE the first \`await\` — once the factory yields, the frame is gone. Outside construction, read from a container directly with \`resolve\`, or open a frame explicitly with \`runInInjectionContext\`. A frame that should be there and is not can also mean two copies of @remodulo/container in one process: each holds its own frame, and injection never crosses between them.`
}
