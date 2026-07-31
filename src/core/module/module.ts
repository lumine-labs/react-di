import { Container, type InjectionToken, type Provider, type Scope } from "../../container/index.js"

import type { ModuleHook, ModuleHooks } from "../providers/module-lifecycle/module-lifecycle.types.js"
import { ModuleLifecycle } from "../providers/module-lifecycle/module-lifecycle.provider.js"
import { ModuleRegistry } from "../providers/module-registry/module-registry.provider.js"
import { Resolver } from "../providers/resolver/resolver.provider.js"
import { id } from "./id.js"

// Params
// ========================================

export type ModuleParams = {
    id?: string
    providers?: Provider[]

    onModuleInit?: ModuleHook
    onModuleMount?: ModuleHook
    onModuleUnmount?: ModuleHook
    onModuleDestroy?: ModuleHook
}

/** Declared shape of a registered provider — what lifecycle collection reads, not the provider itself. */
export type ProviderSnapshot = {
    token: InjectionToken<unknown>
    scope?: Scope // absent = singleton
    lazy?: true
    aliasOf?: InjectionToken<unknown> // useExisting target
}

// Module
// ========================================

export class Module {
    readonly id: string
    readonly container: Container
    readonly parent: Module | null

    readonly #children = new Set<Module>()
    #providers: readonly ProviderSnapshot[] = []

    readonly #lifecycle: ModuleLifecycle
    readonly #hooks: ModuleHooks

    constructor(parent: Module | null, params?: ModuleParams) {
        if (parent && !parent.initialized) {
            throw new Error(childOfUninitializedParent)
        }

        this.parent = parent
        this.container = parent ? parent.container.fork() : new Container()
        this.id = params?.id ?? id()

        const resolver = new Resolver(this.container)
        const registry = new ModuleRegistry(this)
        this.#lifecycle = new ModuleLifecycle(this, registry)

        // `{ provide: Module, useValue: this }` is the ugly-path replacement: injecting Module reaches the
        // container and this instance directly, where injecting ModuleMetadata used to.
        const system: Provider[] = [
            { provide: Module, useValue: this },
            { provide: Resolver, useValue: resolver },
            { provide: ModuleRegistry, useValue: registry },
            { provide: ModuleLifecycle, useValue: this.#lifecycle },
        ]
        const user = params?.providers ?? []

        this.container.register(system)
        this.container.register(user)
        this.#setProviders([...system, ...user])

        const { onModuleInit, onModuleMount, onModuleUnmount, onModuleDestroy } = params ?? {}
        this.#hooks = { onModuleInit, onModuleMount, onModuleUnmount, onModuleDestroy }
    }

    // Phases
    // ========================================

    init(): void {
        this.#lifecycle.init(this.#hooks)
    }

    mount(): void {
        this.#lifecycle.mount()
    }

    unmount(): void {
        this.#lifecycle.unmount()
    }

    destroy(): Promise<void> {
        return this.#lifecycle.destroy()
    }

    get initialized(): boolean {
        return this.#lifecycle.initialized
    }

    get claimed(): boolean {
        return this.#lifecycle.claimed
    }

    get mounted(): boolean {
        return this.#lifecycle.mounted
    }

    // Children
    // ========================================

    get children(): ReadonlySet<Module> {
        return this.#children
    }

    addChild(child: Module): void {
        this.#children.add(child)
    }

    removeChild(child: Module): void {
        this.#children.delete(child)
    }

    // Providers
    // ========================================

    get providers(): readonly ProviderSnapshot[] {
        return this.#providers
    }

    #setProviders(providers: Provider[]): void {
        this.#providers = providers.map((provider) => {
            if (typeof provider === "function") return { token: provider }

            const token = provider.useClass !== undefined ? (provider.provide ?? provider.useClass) : provider.provide
            const snapshot: ProviderSnapshot = { token }

            if ("lazy" in provider && provider.lazy) snapshot.lazy = true
            if ("useExisting" in provider) snapshot.aliasOf = provider.useExisting
            if ("scope" in provider && provider.scope) snapshot.scope = provider.scope

            return snapshot
        })
    }
}

// App
// ========================================

export class App extends Module {
    // Type-only brand: a private member makes App nominal, so a bare Module is not assignable to App.
    // `declare` emits no runtime field.
    declare private readonly __appBrand: undefined

    constructor(params?: ModuleParams) {
        super(null, params)
    }
}

// Errors
// ========================================

const childOfUninitializedParent =
    "Cannot create a child module from an un-initialized parent — its lifecycle is not armed yet, so instances would leak. Init the parent first."
