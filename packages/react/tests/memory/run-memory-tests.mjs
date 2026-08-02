import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

// Memory-suite runner
// ========================================
//
// `pnpm run test:memory`. Standalone by design — `node tests/memory/run-memory-tests.mjs` works too, and
// the memory suite is excluded from `vitest run` so the normal suite never trips over the missing
// `global.gc`.
//
// Two belts: NODE_OPTIONS for the vitest CLI process, and `poolOptions.forks.execArgv` in
// vitest.memory.config.ts for the worker that actually runs the tests. The tests assert `global.gc` is
// present rather than skipping without it, so a broken flag fails loudly instead of quietly passing.

// packages/react — the package root, where vitest.memory.config.ts and node_modules/.bin live.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const vitest = ["vitest", "run", "--config", "vitest.memory.config.ts", ...process.argv.slice(2)]

const isWindows = process.platform === "win32"
const command = isWindows ? "cmd.exe" : "pnpm"
const args = isWindows ? ["/d", "/s", "/c", `pnpm exec ${vitest.join(" ")}`] : ["exec", ...vitest]

const currentNodeOptions = process.env.NODE_OPTIONS?.trim()
const nodeOptions = [currentNodeOptions, "--expose-gc"].filter(Boolean).join(" ")

const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NODE_OPTIONS: nodeOptions },
})

if (result.error) {
    console.error(result.error)
}

process.exit(result.status ?? 1)
