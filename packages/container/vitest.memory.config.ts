import { defineConfig } from "vitest/config"

// Memory suite config
// ========================================
//
// Separate from vitest.config.ts for one reason: these tests need `global.gc`, and that is a process flag.
// Top-level `execArgv` (Vitest 4 flattened the old poolOptions) is the deterministic way to get it — the
// runner also exports NODE_OPTIONS, but that only covers the CLI process and its inheritance, whereas
// execArgv is what tinypool actually spawns the worker with.
//
// One worker, no file parallelism, isolation left on: the kernel's frame slot is MODULE-GLOBAL, so two
// files sharing a worker would share `currentFrame` — and a suite whose whole subject is what that slot
// retains cannot afford a second test writing to it mid-assertion.

// eslint-disable-next-line import/no-default-export
export default defineConfig({
    test: {
        environment: "node",
        globals: true,
        include: ["tests/memory/**/*.test.ts"],
        pool: "forks",
        execArgv: ["--expose-gc"],
        maxWorkers: 1,
        fileParallelism: false,
        maxConcurrency: 1,
        sequence: { concurrent: false },
        testTimeout: 300_000,
        hookTimeout: 60_000,
        // Leak reports go to stdout as they are produced, not buffered per-task.
        disableConsoleIntercept: true,
    },
})
