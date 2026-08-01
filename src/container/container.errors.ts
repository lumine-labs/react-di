import type { InjectionToken, ProviderRegistrationMode, ResolveMode } from "./container.types.js"
import { describeToken } from "../shared/describeToken.js"

// Errors
// ========================================

/** How a provider is named in an error: by its token when it has one, else by what it is. */
function providerSubject(provider: unknown): string {
    const candidate = provider as { provide?: InjectionToken<unknown> } | null | undefined
    const isObject = candidate !== null && typeof candidate === "object"
    const provide = isObject ? candidate.provide : undefined

    return provide !== undefined
        ? `Provider for ${describeToken(provide)}`
        : isObject
          ? "Provider"
          : `Provider ${String(provider)}`
}

export function invalidProvider(provider: unknown): string {
    return `${providerSubject(provider)} has no recognised form — expected a class, or an object with one of useClass, useValue, useFactory or useExisting.`
}

export function mixedImplementationKeys(provider: unknown, keys: readonly string[]): string {
    return `${providerSubject(provider)} mixes ${keys.length} implementation keys (${keys.join(", ")}) — a provider declares exactly one of useClass, useValue, useFactory or useExisting. Note that an explicit \`undefined\` still counts as declared.`
}

export function missingProvide(useKey: string): string {
    return `Provider with ${useKey} requires \`provide\` — only useClass may register under its own token, because a class is one. Give this provider an explicit token.`
}

export function alreadyRegistered(token: InjectionToken<unknown>): string {
    return `Token ${describeToken(token)} is already registered on this container. One token, one registration — mark every provider for it \`multi: true\` to make it a collection, or give each provider its own token.`
}

function describeMode(mode: ProviderRegistrationMode): string {
    return mode === "multi" ? "a multi-provider collection" : "a single registration"
}

export function modeConflict(
    token: InjectionToken<unknown>,
    existing: ProviderRegistrationMode,
    incoming: ProviderRegistrationMode,
    inherited: boolean
): string {
    const where = inherited ? "on an ancestor container" : "on this container"
    const fix =
        incoming === "multi"
            ? "Drop `multi: true` here, or add it to the other registration."
            : "Add `multi: true` here, or drop it from the other registration."

    return `Token ${describeToken(token)} is already ${describeMode(existing)} ${where}, and this provider registers it as ${describeMode(incoming)}. A token is one or the other for the whole container chain — that is what lets \`resolve\` and \`resolveAll\` agree about what it means. ${fix}`
}

export function multiRegistered(token: InjectionToken<unknown>): string {
    return `Token ${describeToken(token)} is a multi-provider collection — several providers contribute to it, so there is no single value to read. Use \`resolveAll\`.`
}

export function singleRegistration(token: InjectionToken<unknown>): string {
    return `Token ${describeToken(token)} is a single registration, not a multi-provider collection — \`resolveAll\` would hide that behind a one-element array. Use \`resolve\`, or mark every provider for it \`multi: true\`.`
}

export function multiNeedsProvide(): string {
    return "Provider with `multi: true` requires `provide` — the class shorthand registers under the class itself, and a collection whose only member is that class is just the class. Name the collection's token explicitly."
}

export function lazyMismatch(token: InjectionToken<unknown>, declared: boolean, incoming: boolean): string {
    return `Provider for ${describeToken(token)} declares \`lazy: ${incoming}\` while the collection already registered for that token is \`lazy: ${declared}\`. A collection is constructed whole — one \`resolveAll\` in the owner's eager pass — so a partly-lazy one has no coherent meaning. Make every useClass and useFactory member agree; useValue and useExisting members build nothing and are not part of this.`
}

export function aliasTargetsMulti(alias: InjectionToken<unknown>, target: InjectionToken<unknown>): string {
    return `Provider for ${describeToken(alias)} cannot alias ${describeToken(target)}: ${describeToken(target)} is a multi-provider collection, and \`useExisting\` is a single-value read of its target — inversify resolves it exactly the way \`resolve\` does, throwing "Ambiguous bindings found" when the members sit on one container and silently picking the nearest one when they are spread across the chain. Alias a single registration, or contribute to the collection with \`{ provide: ${describeToken(target)}, ..., multi: true }\`.`
}

export function notObservable(token: InjectionToken<unknown>): string {
    return `Cannot observe ${describeToken(token)}: nothing is registered for it on this container. Register the provider before calling onResolution.`
}

export function notRegistered(token: InjectionToken<unknown>, mode: ResolveMode): string {
    return mode === "self"
        ? `Token ${describeToken(token)} is not registered in this container (mode "self" reads its own bindings only). Use "nearest" to search its ancestors too.`
        : `Token ${describeToken(token)} is not registered in this container or any ancestor.`
}
