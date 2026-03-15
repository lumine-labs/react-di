import type { InjectionToken, Provider as TsyringeProvider } from "tsyringe"
import type { Constructor } from "../utils/types"

export type ProviderScope = "singleton" | "transient" | "containerScoped" | "resolutionScoped"

export type ProviderDefinition<T = unknown> = {
    provide: InjectionToken<T>
    provider: TsyringeProvider<T> | Constructor<T>
    scope?: ProviderScope
}

export type Provider = Constructor<any> | ProviderDefinition<any>
