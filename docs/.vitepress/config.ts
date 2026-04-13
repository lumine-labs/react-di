import { defineConfig } from "vitepress"

export default defineConfig({
    base: "/react-di/",
    title: "@lumelabs/react-di",
    description: "Module-oriented Dependency Injection for React built on top of tsyringe",
    themeConfig: {
        nav: [
            { text: "Home", link: "/" },
            { text: "Documentation", link: "/guide/getting-started" },
            { text: "Examples", link: "/examples/" },
            { text: "API", link: "/api/" },
        ],
        sidebar: [
            {
                text: "Getting Started",
                items: [
                    { text: "Reasoning", link: "/guide/reasoning" },
                    { text: "Getting Started", link: "/guide/getting-started" },
                ],
            },
            {
                text: "Modules",
                items: [
                    { text: "What is a Module", link: "/guide/modules" },
                    { text: "Usage", link: "/guide/modules-usage" },
                    { text: "ModuleProvider", link: "/guide/module-provider" },
                ],
            },
            {
                text: "Providers",
                items: [
                    { text: "What is a Provider", link: "/guide/what-is-provider" },
                    { text: "Provider Registration", link: "/guide/providers" },
                    { text: "Resolver", link: "/guide/resolver" },
                    { text: "Async Teardown", link: "/guide/cleanup-registry" },
                ],
            },
            {
                text: "Examples",
                items: [{ text: "Overview", link: "/examples/" }],
            },
            {
                text: "API",
                items: [{ text: "Overview", link: "/api/" }],
            },
        ],
        socialLinks: [{ icon: "github", link: "https://github.com/lumine-labs/react-di" }],
    },
})
