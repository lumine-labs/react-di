export type CleanupFn = () => void | Promise<void>

export type CleanupMode = "serial" | "parallel"

export type CleanupOptions = {
    mode?: CleanupMode
}
