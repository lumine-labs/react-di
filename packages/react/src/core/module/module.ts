import { Container } from "@remodulo/container"

import { flattenProviders, type ProviderInput } from "../feature/feature.js"
import { registerProviders } from "../provider/provider.js"
import type { Provider } from "../provider/provider.types.js"
import type { ModuleHook, ModuleHooks } from "../providers/module-lifecycle/module-lifecycle.types.js"
import { ModuleLifecycle } from "../providers/module-lifecycle/module-lifecycle.provider.js"
import { LIFECYCLE } from "../providers/module-lifecycle/module-lifecycle.token.js"
import { ModuleTraversal } from "../providers/module-traversal/module-traversal.provider.js"
import { Resolver } from "../providers/resolver/resolver.provider.js"
import { id } from "./id.js"

const childOfUninitializedParent =
    "Cannot create a child module from an un-initialized parent — its lifecycle is not armed yet, so instances would leak. Init the parent first."

// Params
// ========================================

export type ModuleParams = {
    id?: string
    providers?: readonly ProviderInput[]

    onModuleInit?: ModuleHook
    onModuleMount?: ModuleHook
    onModuleUnmount?: ModuleHook
    onModuleDestroy?: ModuleHook
}

// Module
// ========================================

export class Module {
    readonly id: string
    readonly container: Container

    readonly parent: Module | null
    readonly #children = new Set<Module>()
    readonly traversal: ModuleTraversal

    readonly #lifecycle: ModuleLifecycle

    constructor(parent: Module | null, params?: ModuleParams) {
        if (parent && !parent.initialized) {
            throw new Error(childOfUninitializedParent)
        }

        this.parent = parent
        this.container = parent ? parent.container.fork() : new Container()
        this.id = params?.id ?? id()

        const { onModuleInit, onModuleMount, onModuleUnmount, onModuleDestroy } = params ?? {}
        const hooks: ModuleHooks = { onModuleInit, onModuleMount, onModuleUnmount, onModuleDestroy }

        this.traversal = new ModuleTraversal(this)
        this.#lifecycle = new ModuleLifecycle(this, hooks)

        // System providers: the module's own machinery.
        const system: Provider[] = [
            { provide: Module, useValue: this },
            { provide: Resolver, useValue: new Resolver(this.container) },
            { provide: ModuleTraversal, useValue: this.traversal },
            { provide: LIFECYCLE, useValue: this.#lifecycle },
        ]
        const user = flattenProviders(params?.providers ?? [])

        registerProviders(this.container, [...system, ...user])
    }

    // Phases
    // ========================================

    init(): void {
        this.#lifecycle.init()
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

    get mounted(): boolean {
        return this.#lifecycle.mounted
    }

    get destroyed(): boolean {
        return this.#lifecycle.destroyed
    }

    /** @internal Mid-destroy bookkeeping: claimed but not yet drained. Consumers read `destroyed`. */
    get claimed(): boolean {
        return this.#lifecycle.claimed
    }

    // Children
    // ========================================

    get children(): ReadonlySet<Module> {
        return this.#children
    }

    /** @internal Attach point for the lifecycle's commit. Consumers read `children`. */
    addChild(child: Module): void {
        this.#children.add(child)
    }

    /** @internal Detach point for the lifecycle's rollback and unlink. Consumers read `children`. */
    removeChild(child: Module): void {
        this.#children.delete(child)
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
