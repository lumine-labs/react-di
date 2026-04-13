import type { InjectionToken } from "../../aliases/index.js"
import type { Provider } from "./providers.types.js"

export function getProviderToken(provider: Provider): InjectionToken<any> {
    if (typeof provider === "function") return provider
    return provider.provide
}
