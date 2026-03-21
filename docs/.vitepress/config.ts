import { defineConfig } from "vitepress"

export default defineConfig({
    base: "/react-di/",
    title: "react-di",
    description: "Non-reactive dependency injection for React",
    themeConfig: {
        nav: [
            { text: "Guide", link: "/guide/getting-started" },
            { text: "API", link: "/api/" },
        ],
        sidebar: [
            {
                text: "Guide",
                items: [
                    { text: "Getting Started", link: "/guide/getting-started" },
                    { text: "ModuleProvider", link: "/guide/module-provider" },
                    { text: "Providers", link: "/guide/providers" },
                    { text: "Resolver", link: "/guide/resolver" },
                    { text: "Cleanup Registry", link: "/guide/cleanup-registry" },
                ],
            },
            {
                text: "API",
                items: [{ text: "Overview", link: "/api/" }],
            },
        ],
        socialLinks: [{ icon: "github", link: "https://github.com/lumine-labs/react-di" }],
    },
})
