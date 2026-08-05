/* eslint-disable @typescript-eslint/no-this-alias, new-cap */

import {
    Scope,
    type BindingEntrySnapshot,
    type Constructor,
    type Entry,
    type EntryListener,
    type EntrySnapshot,
    type EntrySource,
    type Found,
    type InjectionToken,
    type RegistrationMode,
    type Resolution,
    type ResolveAllMode,
    type ResolveMode,
} from "./container.types.js"
import type {
    ClassProvider,
    EntryMetadata,
    ExistingProvider,
    FactoryProvider,
    Provider,
    ProviderRegistrationMode,
    ValueProvider,
} from "./providers.types.js"
import { PROVIDER_USE_KEYS } from "./providers.js"
import {
    CycleError,
    RegistrationError,
    ResolutionError,
    aliasTargetsMulti,
    alreadyRegistered,
    circularDependency,
    invalidProvider,
    missingProvide,
    mixedImplementationKeys,
    modeConflict,
    multiNeedsProvide,
    multiRegistered,
    notObservable,
    notRegistered,
    providerToken,
    singleRegistration,
} from "./container.errors.js"
import type { Frame } from "./frame.types.js"
import { activeFrame, runInFrame } from "./frame.js"

// Container
// ========================================

export class Container {
    readonly #parent: Container | null

    // Token -> its own entries, in registration order. Aliases included: they resolve, they just build nothing.
    readonly #entries = new Map<InjectionToken, Entry[]>()
    // Every own entry in registration order, for the layer above to drive an eager pass from.
    readonly #order: Entry[] = []

    // Token -> mode, this container only. Chain-wide by construction, so the nearest entry answers.
    readonly #modes = new Map<InjectionToken, ProviderRegistrationMode>()
    // Alias target -> its aliases, so a token turning multi fails whichever order the two arrived in.
    readonly #aliasTargets = new Map<InjectionToken, InjectionToken[]>()

    constructor(parent?: Container) {
        this.#parent = parent ?? null
    }

    fork(): Container {
        return new Container(this)
    }

    get parent(): Container | null {
        return this.#parent
    }

    // Registration
    // ========================================

    register(provider: Provider | Provider[]): void {
        if (Array.isArray(provider)) {
            for (const p of provider) this.register(p)
            return
        }

        if (typeof provider === "function") {
            this.#claim(provider, false)
            this.#record(provider, { kind: "class", implementation: provider }, Scope.Singleton, false)
            return
        }

        if (provider === null || typeof provider !== "object") {
            throw new RegistrationError(invalidProvider(provider), providerToken(provider))
        }

        const presentUseKeys = PROVIDER_USE_KEYS.filter((key) => key in provider)
        if (presentUseKeys.length > 1) {
            throw new RegistrationError(mixedImplementationKeys(provider, presentUseKeys), providerToken(provider))
        }
        if (presentUseKeys.length === 0) {
            throw new RegistrationError(invalidProvider(provider), providerToken(provider))
        }
        const [useKey] = presentUseKeys

        const multi = provider.multi === true
        const metadata = sealMetadata(provider.metadata)

        switch (useKey) {
            case "useClass": {
                const p = provider as ClassProvider

                if (typeof p.useClass !== "function") {
                    throw new RegistrationError(invalidProvider(provider), p.provide)
                }

                if (multi && p.provide === undefined) {
                    throw new RegistrationError(multiNeedsProvide(), p.useClass)
                }

                const token = p.provide ?? p.useClass
                const scope = p.scope ?? Scope.Singleton

                this.#claim(token, multi)
                this.#record(token, { kind: "class", implementation: p.useClass }, scope, multi, metadata)
                return
            }

            case "useFactory": {
                const p = provider as FactoryProvider

                if (typeof p.useFactory !== "function") {
                    throw new RegistrationError(invalidProvider(provider), p.provide)
                }

                this.#assertProvide(p.provide, useKey)
                const scope = p.scope ?? Scope.Singleton

                this.#claim(p.provide, multi)
                this.#record(p.provide, { kind: "factory", factory: p.useFactory }, scope, multi, metadata)
                return
            }

            case "useValue": {
                const p = provider as ValueProvider

                this.#assertProvide(p.provide, useKey)
                this.#claim(p.provide, multi)
                this.#record(p.provide, { kind: "value", value: p.useValue }, Scope.Singleton, multi, metadata)
                return
            }

            case "useExisting": {
                const p = provider as ExistingProvider

                if (p.useExisting === undefined) {
                    throw new RegistrationError(invalidProvider(provider), p.provide)
                }

                this.#assertProvide(p.provide, useKey)

                // An alias may BE a collection member, never TARGET one: it redirects to a single-value
                // read, which is what the mode guards refuse.
                if (this.#modeOf(p.useExisting) === "multi") {
                    throw new RegistrationError(aliasTargetsMulti(p.provide, p.useExisting), p.provide)
                }

                this.#claim(p.provide, multi)
                this.#record(p.provide, { kind: "alias", target: p.useExisting }, Scope.Singleton, multi, metadata)
                this.#rememberAlias(p.useExisting, p.provide)
                return
            }
            default:
                throw new RegistrationError(invalidProvider(provider), providerToken(provider))
        }
    }

    isRegistered(token: InjectionToken, mode: RegistrationMode = "nearest"): boolean {
        return mode === "self" ? this.#owns(token) : this.#findSingle(token, "nearest") !== undefined
    }

    // Resolution
    // ========================================

    resolve<T>(token: InjectionToken<T>, mode: ResolveMode = "nearest"): T {
        return this.#readSingle(token, mode, this.#context(), true) as T
    }

    resolveOptional<T>(token: InjectionToken<T>, mode: ResolveMode = "nearest"): T | undefined {
        return this.#readSingle(token, mode, this.#context(), false) as T | undefined
    }

    resolveOr<T, F>(token: InjectionToken<T>, fallback: () => F, mode?: ResolveMode): T | F
    resolveOr<T, F>(token: InjectionToken<T>, fallback: F, mode?: ResolveMode): T | F
    resolveOr<T, F>(token: InjectionToken<T>, fallback: F | (() => F), mode: ResolveMode = "nearest"): T | F {
        this.#assertSingleValued(token, mode)

        const found = this.#findSingle(token, mode)
        if (found) return found.owner.#materialize(found.entry, this.#context()) as T

        return typeof fallback === "function" ? (fallback as () => F)() : fallback
    }

    resolveAll<T>(token: InjectionToken<T>, mode: ResolveAllMode = "chained"): T[] {
        if (this.#modeOf(token) === "single") {
            throw new ResolutionError(singleRegistration(token), token, mode)
        }

        const context = this.#context()
        const all: unknown[] = []

        for (const owner of this.#contributors(token, mode)) {
            for (const entry of owner.#entries.get(token) ?? []) {
                all.push(owner.#materialize(entry, context))
            }
        }

        return all as T[]
    }

    /** Build `cls` in this container's context without registering it or anything it reaches. */
    construct<T>(cls: Constructor<T>): T {
        const context = this.#context()
        this.#assertAcyclic(cls, context)

        const frame: Frame = { container: this, request: context.request, chain: [...context.chain, cls] }
        return runInFrame(frame, () => new cls())
    }

    // Public lookups
    // ========================================

    registrations(): readonly EntrySnapshot[] {
        return this.#order.map(snapshot)
    }

    entry(token: InjectionToken): EntrySnapshot | undefined {
        if (this.#modes.get(token) === "multi") throw new ResolutionError(multiRegistered(token), token)
        const own = this.#entries.get(token)
        return own === undefined || own.length === 0 ? undefined : snapshot(own[0])
    }

    entries(token: InjectionToken): readonly EntrySnapshot[] {
        if (this.#modes.get(token) === "single") throw new ResolutionError(singleRegistration(token), token)
        const entries = this.#entries.get(token) ?? []
        return entries.map(snapshot)
    }

    // Observation
    // ========================================

    /**
     * Observe every instance this container builds for the token. One attach per member of a collection,
     * and every notification carries the snapshot of the entry that produced the value.
     */
    onResolution<T>(token: InjectionToken<T>, onResolved: (value: T, snapshot: BindingEntrySnapshot<T>) => void): void {
        // An alias owns no binding and constructs nothing, so it is nothing to attach to.
        const bindings = (this.#entries.get(token) ?? []).filter((entry) => entry.source.kind !== "alias")
        if (bindings.length === 0) throw new ResolutionError(notObservable(token), token)

        for (const entry of bindings) {
            if (entry.listeners) entry.listeners.push(onResolved as EntryListener)
            else entry.listeners = [onResolved as EntryListener]
        }
    }

    // Reads
    // ========================================

    /** Everything one read shares with the graph below it: the ambient frame's, or a fresh graph. */
    #context(): Resolution {
        const frame = activeFrame()
        return frame ? { request: frame.request, chain: frame.chain } : { request: new Map(), chain: [] }
    }

    #readSingle(token: InjectionToken, mode: ResolveMode, context: Resolution, required: boolean): unknown {
        this.#assertSingleValued(token, mode)

        const found = this.#findSingle(token, mode)
        if (!found) {
            if (required) throw new ResolutionError(notRegistered(token, mode), token, mode)
            return undefined
        }

        return found.owner.#materialize(found.entry, context)
    }

    #owns(token: InjectionToken): boolean {
        const entries = this.#entries.get(token)
        return entries !== undefined && entries.length > 0
    }

    /** The nearest own entry at or above this container, or this container's own under `self`. */
    #findSingle(token: InjectionToken, mode: ResolveMode): Found | undefined {
        let current: Container | null = this
        while (current) {
            const entries: Entry[] | undefined = current.#entries.get(token)
            if (entries !== undefined && entries.length > 0) return { owner: current, entry: entries[0] }
            if (mode === "self") return undefined
            current = current.#parent
        }
        return undefined
    }

    /** The containers a collection read accumulates from, nearest first. */
    #contributors(token: InjectionToken, mode: ResolveAllMode): Container[] {
        if (mode === "self") return this.#owns(token) ? [this] : []

        const contributors: Container[] = []
        let current: Container | null = this
        while (current) {
            if (current.#owns(token)) {
                contributors.push(current)
                // `nearest` reads ONE container's bindings — the nearest contributor's — never the chain
                // above it. Accumulation is what `chained` is for.
                if (mode === "nearest") return contributors
            }
            current = current.#parent
        }
        return contributors
    }

    // Construction
    // ========================================

    #materialize(entry: Entry, context: Resolution): unknown {
        if (entry.source.kind === "alias") {
            return this.#readSingle(entry.source.target, "nearest", context, true)
        }

        if (entry.cache) return entry.cache.value
        if (entry.scope === Scope.Request && context.request.has(entry)) return context.request.get(entry)

        if (entry.source.kind === "value") {
            const { value } = entry.source
            entry.cache = { value }
            this.#notify(entry, value)
            return value
        }

        this.#assertAcyclic(entry.token, context)

        // Run the build inside the entry's own frame, so `inject()` anywhere below sees this container.
        const frame: Frame = {
            container: this,
            request: context.request,
            chain: [...context.chain, entry.token],
        }
        const instance = runInFrame(frame, () => this.#build(entry))

        if (entry.scope === Scope.Singleton) entry.cache = { value: instance }
        else if (entry.scope === Scope.Request) context.request.set(entry, instance)

        this.#notify(entry, instance)
        return instance
    }

    #build(entry: Entry): unknown {
        if (entry.source.kind === "class") return new entry.source.implementation()
        if (entry.source.kind === "factory") return entry.source.factory()
        throw new RegistrationError(invalidProvider(entry.token), entry.token)
    }

    /** Copied list: a listener attached mid-notification joins for the next construction, not this walk. */
    #notify(entry: Entry, instance: unknown): void {
        if (!entry.listeners) return
        const view = snapshot(entry) as BindingEntrySnapshot
        for (const notify of [...entry.listeners]) notify(instance, view)
    }

    // Claim
    // ========================================

    /** Settle a registration's mode against everything already registered for the token. */
    #claim(token: InjectionToken, multi: boolean): void {
        const mode: ProviderRegistrationMode = multi ? "multi" : "single"
        const own = this.#modes.get(token)

        if (own === "single" && mode === "single") throw new RegistrationError(alreadyRegistered(token), token)
        if (own !== undefined && own !== mode) {
            throw new RegistrationError(modeConflict(token, own, mode, false), token)
        }

        // Only the first own registration consults the chain; later ones are already reconciled with it.
        if (own === undefined) {
            const inherited = this.#parent === null ? undefined : this.#parent.#modeOf(token)
            if (inherited !== undefined && inherited !== mode) {
                throw new RegistrationError(modeConflict(token, inherited, mode, true), token)
            }
        }

        if (mode === "multi") {
            const alias = this.#aliasOf(token)
            if (alias !== undefined) {
                throw new RegistrationError(aliasTargetsMulti(alias, token), token)
            }
        }

        this.#modes.set(token, mode)
    }

    // Indexes
    // ========================================

    #rememberAlias(target: InjectionToken, alias: InjectionToken): void {
        const aliases = this.#aliasTargets.get(target)
        if (aliases) aliases.push(alias)
        else this.#aliasTargets.set(target, [alias])
    }

    /** Registration order is the order a collection resolves in. */
    #record(token: InjectionToken, source: EntrySource, scope: Scope, multi: boolean, metadata?: EntryMetadata): void {
        const entry: Entry =
            metadata === undefined ? { token, source, scope, multi } : { token, source, scope, multi, metadata }

        const entries = this.#entries.get(token)
        if (entries) entries.push(entry)
        else this.#entries.set(token, [entry])

        this.#order.push(entry)
    }

    /** Nearest declared mode at or above this container, or undefined when nothing declares the token. */
    #modeOf(token: InjectionToken): ProviderRegistrationMode | undefined {
        let current: Container | null = this
        while (current) {
            const mode: ProviderRegistrationMode | undefined = current.#modes.get(token)
            if (mode !== undefined) return mode
            current = current.#parent
        }
        return undefined
    }

    /** Nearest token aliasing `target` at or above this container, if any. */
    #aliasOf(target: InjectionToken): InjectionToken | undefined {
        let current: Container | null = this
        while (current) {
            const aliases: InjectionToken[] | undefined = current.#aliasTargets.get(target)
            if (aliases !== undefined && aliases.length > 0) return aliases[0]
            current = current.#parent
        }
        return undefined
    }

    // Validators
    // ========================================

    #assertProvide(token: InjectionToken | undefined, useKey: string): void {
        if (token === undefined) throw new RegistrationError(missingProvide(useKey))
    }

    #assertSingleValued(token: InjectionToken, mode: ResolveMode): void {
        if (this.#modeOf(token) === "multi") {
            throw new ResolutionError(multiRegistered(token), token, mode)
        }
    }

    /** The chain is reported from the repeat that opened the cycle, not from wherever the read began. */
    #assertAcyclic(token: InjectionToken, context: Resolution): void {
        const start = context.chain.indexOf(token)
        if (start === -1) return

        const chain = [...context.chain.slice(start), token]
        throw new CycleError(circularDependency(chain), chain)
    }
}

// Helpers
// ========================================

function sealMetadata(metadata: EntryMetadata | undefined): EntryMetadata | undefined {
    return metadata === undefined ? undefined : Object.freeze({ ...metadata })
}

function snapshot(entry: Entry): EntrySnapshot {
    const metadata = entry.metadata !== undefined && { metadata: entry.metadata }

    if (entry.source.kind === "alias") {
        return Object.freeze({
            kind: "alias" as const,
            token: entry.token,
            target: entry.source.target,
            multi: entry.multi,
            ...metadata,
        })
    }

    return Object.freeze({
        kind: entry.source.kind,
        token: entry.token,
        scope: entry.scope,
        multi: entry.multi,
        ...metadata,
    })
}
