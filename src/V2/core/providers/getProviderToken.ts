import type { InjectionToken, Provider } from "../../container"

export function getProviderToken(provider: Provider): InjectionToken<any> {
    if (typeof provider === "function") return provider
    return provider.provide
}
