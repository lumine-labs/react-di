import {
    container,
    injectable,
    singleton,
    inject,
    injectAll,
    injectWithTransform,
    injectAllWithTransform,
    delay,
    Lifecycle,
    instanceCachingFactory,
    predicateAwareClassFactory,
    instancePerContainerCachingFactory,
    type DependencyContainer as TsDependencyContainer,
    type InjectionToken as TsInjectionToken,
    type RegistrationOptions as TsRegistrationOptions,
    type Frequency as TsFrequency,
    type Disposable as TsDisposable,
} from "tsyringe"

export type DependencyContainer = TsDependencyContainer
export type InjectionToken<T = unknown> = TsInjectionToken<T>
export type RegistrationOptions = TsRegistrationOptions
export type Frequency = TsFrequency
export type Disposable = TsDisposable

export const Container = container
export const Scope = {
    Transient: Lifecycle.Transient,
    Singleton: Lifecycle.Singleton,
    ResolutionScoped: Lifecycle.ResolutionScoped,
    ContainerScoped: Lifecycle.ContainerScoped,
} as const
export type Scope = (typeof Scope)[keyof typeof Scope]

export const Injectable = injectable
export const Singleton = singleton
export const Inject = inject
export const InjectAll = injectAll
export const InjectWithTransform = injectWithTransform
export const InjectAllWithTransform = injectAllWithTransform
export const Delay = delay

export const SingletonFactory = instanceCachingFactory
export const ConditionalFactory = predicateAwareClassFactory
export const ScopedFactory = instancePerContainerCachingFactory
