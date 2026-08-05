import type { Frame } from "./frame.types.js"

// The frame stack
// ========================================

let currentFrame: Frame | null = null

/** @internal Frame plumbing. Consumers reach the frame through `inject()`, never through the stack. */
export function activeFrame(): Frame | null {
    return currentFrame
}

/** @internal Frame plumbing. Consumers reach the frame through `inject()`, never through the stack. */
export function runInFrame<T>(frame: Frame, run: () => T): T {
    const outer = currentFrame
    currentFrame = frame

    try {
        return run()
    } finally {
        currentFrame = outer
    }
}
