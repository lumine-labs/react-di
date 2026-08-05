import { defaultExclude, defineConfig } from "vitest/config"

// eslint-disable-next-line import/no-default-export
export default defineConfig({
    test: {
        environment: "node",
        globals: true,
        include: ["tests/**/*.test.ts"],
        // tests/memory needs --expose-gc and a single fork; it has its own config and `pnpm run test:memory`.
        exclude: [...defaultExclude, "tests/memory/**"],
        coverage: {
            provider: "v8",
            reporter: ["text", "html", "lcov"],
            include: ["src/**/*.ts"],
            exclude: ["tests/**/*.test.ts"],
        },
    },
})
