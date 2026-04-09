import { spawnSync } from "node:child_process"

const command = process.platform === "win32" ? "cmd.exe" : "npm"
const args =
    process.platform === "win32"
        ? ["/d", "/s", "/c", "npm exec -- vitest run tests/memory"]
        : ["exec", "--", "vitest", "run", "tests/memory"]

const currentNodeOptions = process.env.NODE_OPTIONS?.trim()
const nodeOptions = [currentNodeOptions, "--expose-gc"].filter(Boolean).join(" ")

const result = spawnSync(command, args, {
    stdio: "inherit",
    env: {
        ...process.env,
        NODE_OPTIONS: nodeOptions,
    },
})

process.exit(result.status ?? 1)
