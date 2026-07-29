import { defineConfig } from "vitest/config"

// Memory suite config
// ========================================
//
// Separate from vitest.config.ts for one reason: these tests need `global.gc`, and that is a process flag.
// Top-level `execArgv` (Vitest 4 flattened the old poolOptions) is the deterministic way to get it — the
// runner also exports NODE_OPTIONS, but that only covers the CLI process and its inheritance, whereas
// execArgv is what tinypool actually spawns the worker with.
//
// One worker, no file parallelism, isolation left on: each file gets its own child process, so a file's
// `heapUsed` baseline is not contaminated by whatever ran before it, and nothing competes for the GC.

// eslint-disable-next-line import/no-default-export
export default defineConfig({
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: ["./tests/setup/setupTests.ts"],
        include: ["tests/memory/**/*.test.ts", "tests/memory/**/*.test.tsx"],
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
