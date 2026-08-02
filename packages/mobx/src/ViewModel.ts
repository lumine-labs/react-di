import type { ProviderLifecycle } from "@remodulo/react"

// ViewModel
// ========================================

export type Disposer = () => void

export abstract class ViewModel implements ProviderLifecycle {
    readonly #disposers: Disposer[] = []
    #controller: AbortController | null = null

    constructor() {
        const override = this.onModuleDestroy
        if (override !== ViewModel.prototype.onModuleDestroy) {
            Object.defineProperty(this, "onModuleDestroy", {
                configurable: true,
                enumerable: true,
                writable: true,
                value: (): void => {
                    try {
                        override.call(this)
                    } finally {
                        this.#teardown()
                    }
                },
            })
        }
    }

    protected track<T extends Disposer>(disposer: T): T {
        this.#disposers.push(disposer)
        return disposer
    }

    protected signal(): AbortSignal {
        this.#controller ??= new AbortController()
        return this.#controller.signal
    }

    onModuleDestroy(): void {
        this.#teardown()
    }

    #teardown(): void {
        const disposers = this.#disposers.splice(0).reverse()
        for (const dispose of disposers) {
            try {
                dispose()
            } catch (error) {
                console.error("ViewModel disposer", error)
            }
        }

        this.#controller?.abort()
    }
}
