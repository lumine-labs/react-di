#!/usr/bin/env node
/**
 * Typecheck the PUBLISHED declarations from the outside.
 *
 * `npm run typecheck` compiles `src/` under our own tsconfig and proves only that we are consistent
 * with ourselves. This runner installs the packed package into two throwaway consumer projects — one
 * on `@types/react` 18 with `moduleResolution: bundler`, one on `@types/react` 19 with NodeNext, both
 * stricter than we compile ourselves — and typechecks each against `dist/*.d.ts`.
 *
 * Requires `npm run build` first; it never builds, so what is checked is exactly what was built.
 *
 * Why `--install-links`: a plain `file:` dependency is SYMLINKED into the consumer's `node_modules`,
 * and TypeScript resolves the symlink before looking for `react` — so the library's declarations would
 * be typechecked against the repo root's `@types/react` (always 19) no matter what the consumer pins,
 * which silently voids the whole react18 profile. `--install-links` copies the packed package instead
 * and installs its dependencies into the consumer's own tree, so `react` resolves consumer-locally.
 *
 * Why the deletion and the hash check: npm treats an already-installed local package as up to date even
 * after its contents change ("up to date in 452ms" with a stale `dist`). Removing the installed copy
 * plus the hidden lockfile forces a re-pack, and the hash comparison afterwards turns any future npm
 * caching surprise into a loud failure instead of a green run against yesterday's declarations.
 */

import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { existsSync, lstatSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const consumersDir = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(consumersDir, "..", "..")
const packageName = "@luminelabs/react-di"

const consumers = ["react18", "react19"]

function fail(message) {
    console.error(`\n[consumers] ${message}\n`)
    process.exit(1)
}

function run(command, args, cwd) {
    console.log(`[consumers] ${relative(packageRoot, cwd) || "."}$ ${command} ${args.join(" ")}`)
    const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: true })

    if (result.error) fail(`failed to spawn \`${command}\`: ${result.error.message}`)
    if (result.status !== 0) fail(`\`${command} ${args.join(" ")}\` exited with ${result.status}`)
}

// Hash of the declaration surface only — that is what a consumer typechecks against.
function hashDeclarations(distDir) {
    const files = []

    const walk = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            const full = join(dir, entry.name)
            if (entry.isDirectory()) walk(full)
            else if (entry.name.endsWith(".d.ts")) files.push(full)
        }
    }

    walk(distDir)

    const hash = createHash("sha256")
    for (const file of files) {
        hash.update(relative(distDir, file).replaceAll("\\", "/"))
        hash.update(readFileSync(file))
    }

    return { digest: hash.digest("hex"), count: files.length }
}

const rootDist = join(packageRoot, "dist")
if (!existsSync(join(rootDist, "index.d.ts"))) {
    fail("dist/index.d.ts is missing — run `npm run build` before `npm run typecheck:consumers`.")
}

const expected = hashDeclarations(rootDist)
console.log(`[consumers] built declarations: ${expected.count} .d.ts files, sha256 ${expected.digest.slice(0, 16)}`)

for (const name of consumers) {
    const consumerDir = join(consumersDir, name)
    const installedDir = join(consumerDir, "node_modules", packageName)

    console.log(`\n[consumers] === ${name} ===`)

    rmSync(installedDir, { recursive: true, force: true })
    rmSync(join(consumerDir, "node_modules", ".package-lock.json"), { force: true })

    run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--install-links"], consumerDir)

    if (!existsSync(installedDir)) fail(`${name}: ${packageName} was not installed`)
    if (lstatSync(installedDir).isSymbolicLink()) {
        fail(`${name}: ${packageName} is a symlink — the consumer would typecheck against the repo's own deps`)
    }

    const installed = hashDeclarations(join(installedDir, "dist"))
    if (installed.digest !== expected.digest) {
        fail(
            `${name}: installed declarations do not match the build\n` +
                `  built:     ${expected.count} files, sha256 ${expected.digest}\n` +
                `  installed: ${installed.count} files, sha256 ${installed.digest}\n` +
                `  npm served a cached copy; delete ${join(consumerDir, "node_modules")} and retry.`
        )
    }
    console.log(`[consumers] ${name}: installed declarations match the build (${installed.count} .d.ts files)`)

    run("npm", ["run", "typecheck"], consumerDir)
}

console.log("\n[consumers] both consumer profiles typecheck against the published declarations.")
