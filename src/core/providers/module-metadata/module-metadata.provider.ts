import type { Container, InjectionToken, Provider, Scope } from "../../../container/index.js"

// ModuleMetadata
// ========================================

export type ModuleMetadataInit = {
    id: string
    container: Container
    parent: Container | null
    providers?: readonly Provider[]
}

export type ModuleMetadataProvider = {
    token: InjectionToken<unknown>
    scope?: Scope // absent = singleton
    lazy?: true
    aliasOf?: InjectionToken<unknown> // useExisting target
}

export class ModuleMetadata {
    readonly id: string

    readonly container: Container

    readonly parent: Container | null

    readonly #children = new Set<Container>()

    #providers: readonly ModuleMetadataProvider[]

    committed = false
    mounted = false

    constructor(init: ModuleMetadataInit) {
        this.id = init.id
        this.container = init.container
        this.parent = init.parent
        this.#providers = []
    }

    // Providers
    // ========================================

    setProviders(providers: Provider[]): void {
        this.#providers = providers.map((provider) => {
            if (typeof provider === "function") return { token: provider }

            const metadata: ModuleMetadataProvider = { token: provider.provide }

            if ("lazy" in provider && provider.lazy) metadata.lazy = true
            if ("useExisting" in provider) metadata.aliasOf = provider.useExisting
            if ("scope" in provider && provider.scope) metadata.scope = provider.scope

            return metadata
        })
    }

    get providers(): readonly ModuleMetadataProvider[] {
        return this.#providers
    }

    // Children
    // ========================================

    get children(): ReadonlySet<Container> {
        return this.#children
    }

    addChild(container: Container): void {
        this.#children.add(container)
    }

    removeChild(container: Container): void {
        this.#children.delete(container)
    }
}
