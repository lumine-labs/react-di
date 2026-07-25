/**
 * Type-regression consumer.
 *
 * This file is compiled against the PUBLISHED declarations — `node_modules/@luminelabs/react-di/dist`,
 * installed from the packed package, never from `src` and never through a path alias. `npm run
 * typecheck` in the repo root only proves `src/` is self-consistent under our own tsconfig; this proves
 * the emitted `.d.ts` still means something in somebody else's project.
 *
 * Nothing here runs. `tsc --noEmit` is the entire test, and two kinds of assertion carry the weight:
 *
 *   1. `Expect<Equals<A, B>>` — pins an INFERRED type exactly. The dangerous regression is not a
 *      compile error, it is a silent widening to `any`: `createModule<UserProps>()` handing back
 *      `PropsRef<any>` compiles perfectly and destroys every consumer downstream. `Equals` is the
 *      strict variant, so `any` is never equal to a concrete type.
 *   2. `@ts-expect-error` — errors that MUST stay errors. When a type widens to `any` the expected
 *      error disappears and the directive itself becomes the failure.
 *
 * Keep this file identical between the react18 and react19 consumers. The two profiles differ only in
 * `package.json` (@types/react major) and `tsconfig.json` (module resolution) — that is the variable
 * under test; the source is the control.
 */

import "reflect-metadata"

import { useState } from "react"
import type { ComponentType, ReactElement, ReactNode } from "react"

import {
    AsyncTeardown,
    ConditionalFactory,
    Container,
    Delay,
    Inject,
    InjectAll,
    InjectAllWithTransform,
    Injectable,
    InjectWithTransform,
    ModuleMetadata,
    ModuleProvider,
    PropsRef,
    Resolver,
    Scope,
    Singleton,
    SingletonFactory,
    Token,
    createModule,
    makeTokenizer,
    resolve,
    resolveAll,
    resolveOr,
    tryResolve,
    useAsyncTeardown,
    useContainer,
    useModule,
    useModuleContext,
    useModuleRebuild,
    usePropsRef,
    useResolve,
    useResolveAll,
    useTryResolve,
} from "@luminelabs/react-di"

// The `./types` subpath has to carry the whole type surface on its own — a consumer that only wants
// types must never have to reach into `.` or into `dist/`.
import type {
    CleanupFn,
    ClassProvider,
    Constructor,
    CreateModuleOptions,
    CreateModuleParams,
    DependencyContainer,
    Disposable,
    ExistingProvider,
    FactoryDependency,
    FactoryModuleParams,
    FactoryProvider,
    Frequency,
    InjectionToken,
    ModuleContextValue,
    ModuleHook,
    ModuleHooks,
    ModuleProviderProps,
    ModuleResolution,
    ModuleResolutionParams,
    OptionalFactoryDependency,
    PropsAdapter,
    Provider,
    ProviderLifecycle,
    ProviderScope,
    RegistrationOptions,
    RootModuleParams,
    ScopedModuleParams,
    TokenOptions,
    Tokenizer,
    UsePropsRefOptions,
    UsePropsRefResult,
    ValueProvider,
} from "@luminelabs/react-di/types"

// Assertion helpers — zero dependency on purpose.
// ========================================

// The strict equality trick: two deferred conditionals are assignable to each other only when `A` and
// `B` are the *identical* type, so `any` never sneaks through as "close enough".
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type IsAny<T> = 0 extends 1 & T ? true : false
type Not<T extends boolean> = T extends true ? false : true
type Expect<T extends true> = T

// The gate is only worth something if the strict flags are really in effect — a tsconfig regression
// that quietly relaxes them would otherwise leave everything below still green.
// ========================================

declare const someStrings: string[]
const indexedString = someStrings[0]
type _NoUncheckedIndexedAccessIsOn = Expect<Equals<typeof indexedString, string | undefined>>

declare const maybeLimit: number | undefined
// @ts-expect-error exactOptionalPropertyTypes: an explicit `undefined` is not a legal value for `limit?: number`.
const exactOptionalGuard: UserProps = { userId: "u-0", limit: maybeLimit }
void exactOptionalGuard

// Domain — an ordinary feature slice, written the way an app would write it.
// ========================================

type UserProps = {
    userId: string
    limit?: number
}

// The view model an adapter produces: the `T !== P` shape of `usePropsRef` / `createModule`.
type UserVM = {
    id: string
    take: number
}

type AppConfig = {
    baseUrl: string
    retries: number
}

interface Logger {
    log(message: string): void
}

interface Plugin {
    name: string
}

// Tokens
// ========================================

const CONFIG = Token<AppConfig>("consumer.config")
type _ConfigTokenIsTyped = Expect<Equals<typeof CONFIG, InjectionToken<AppConfig>>>
type _ConfigTokenIsNotAny = Expect<Not<IsAny<typeof CONFIG>>>

const PLUGIN = Token<Plugin>("consumer.plugin")
const LOGGER = Token<Logger>("consumer.logger")

const appTokenizer = makeTokenizer("@consumer")
const FEATURE_LOGGER = appTokenizer<Logger>("feature.logger")
type _FeatureLoggerIsTyped = Expect<Equals<typeof FEATURE_LOGGER, InjectionToken<Logger>>>

type _TokenizerShape = Expect<Equals<typeof appTokenizer, Tokenizer>>

const tokenOptions: TokenOptions = { allowDuplicate: true }
const DUPLICATE_PLUGIN = Token<Plugin>("consumer.plugin", tokenOptions)
type _DuplicatePluginIsTyped = Expect<Equals<typeof DUPLICATE_PLUGIN, InjectionToken<Plugin>>>

// Services
// ========================================

@Injectable()
class ApiClient {
    async get<T>(path: string): Promise<T> {
        const response = await fetch(path)
        return (await response.json()) as T
    }
}

class ConsoleLogger implements Logger {
    constructor(private readonly prefix: string) {}

    log(message: string): void {
        console.log(`${this.prefix}${message}`)
    }
}

// A service that both participates in the module lifecycle and reads component props through the
// auto-registered bridge.
@Injectable()
class UserStore implements ProviderLifecycle {
    private off: (() => void) | null = null
    private snapshot: UserProps | null = null

    constructor(
        @Inject(PropsRef) private readonly props: PropsRef<UserProps>,
        @Inject(ApiClient) private readonly api: ApiClient,
        @Inject(CONFIG) private readonly config: AppConfig
    ) {}

    onModuleInit(): void {
        // The subscription can outlive a rebuilt-away service, so the `off` is kept and released below.
        this.off = this.props.onUpdate(
            (next, prev) => {
                type _SubscriberNext = Expect<Equals<typeof next, UserProps>>
                type _SubscriberPrev = Expect<Equals<typeof prev, UserProps>>
                this.snapshot = next
                void prev
            },
            { immediate: true }
        )
    }

    onModuleMount(): void {}

    onModuleUnmount(): void {}

    onModuleDestroy(): void {
        this.off?.()
        this.off = null
    }

    get userId(): string {
        const current = this.props.current
        type _PropsRefCurrent = Expect<Equals<typeof current, UserProps>>
        return this.snapshot?.userId ?? current.userId
    }

    async load(): Promise<Plugin[]> {
        const current = this.props.current
        return this.api.get<Plugin[]>(
            `${this.config.baseUrl}/users/${current.userId}?limit=${current.limit ?? this.config.retries}`
        )
    }
}

// The two system providers a consumer is allowed to inject.
@Injectable()
class Diagnostics {
    constructor(
        @Inject(ModuleMetadata) private readonly metadata: ModuleMetadata,
        @Inject(Resolver) private readonly resolver: Resolver
    ) {}

    describe(): string {
        const id = this.metadata.id
        type _MetadataId = Expect<Equals<typeof id, string>>

        const ownContainer = this.metadata.container
        type _MetadataContainer = Expect<Equals<typeof ownContainer, DependencyContainer>>

        const parent = this.metadata.parent
        type _MetadataParent = Expect<Equals<typeof parent, DependencyContainer | null>>

        const children = this.metadata.children
        type _MetadataChildren = Expect<Equals<typeof children, ReadonlySet<DependencyContainer>>>

        const declared = this.metadata.providers
        type _MetadataProviders = Expect<Equals<typeof declared, readonly Provider[]>>

        const store = this.resolver.resolve(UserStore)
        type _ResolverResolve = Expect<Equals<typeof store, UserStore>>

        const maybeLogger = this.resolver.tryResolve(LOGGER, false)
        type _ResolverTryResolve = Expect<Equals<typeof maybeLogger, Logger | undefined>>

        return `${id}/${children.size}/${declared.length}/${store.userId}/${maybeLogger ? "y" : "n"}`
    }
}

@Singleton()
class AppClock {
    now(): number {
        return Date.now()
    }
}

class PluginNames {
    transform(plugins: Plugin[]): string[] {
        return plugins.map((plugin) => plugin.name)
    }
}

class ConfigBaseUrl {
    transform(config: AppConfig): string {
        return config.baseUrl
    }
}

@Injectable()
class PluginRegistry {
    constructor(
        @InjectAll(PLUGIN) readonly plugins: Plugin[],
        @InjectAllWithTransform(PLUGIN, PluginNames) readonly names: string[],
        @InjectWithTransform(CONFIG, ConfigBaseUrl) readonly baseUrl: string,
        @Inject(Delay(() => ApiClient)) readonly api: ApiClient
    ) {}
}

// Providers — all five shapes the registry accepts.
// ========================================

// 1. constructor shorthand
const constructorProvider: Provider = ApiClient
const apiConstructor: Constructor<ApiClient> = ApiClient
type _ConstructorInstance = Expect<Equals<InstanceType<typeof apiConstructor>, ApiClient>>

// 2. class provider
const classProvider: ClassProvider<UserStore> = {
    provide: UserStore,
    useClass: UserStore,
    scope: "singleton",
}

// 3. value provider
const valueProvider: ValueProvider<AppConfig> = {
    provide: CONFIG,
    useValue: { baseUrl: "https://api.example.com", retries: 2 },
}

// 4. factory provider, with `inject` (a required and an optional dependency)
const optionalMetadata: OptionalFactoryDependency<ModuleMetadata> = { token: ModuleMetadata, optional: true }
const factoryDependencies: FactoryDependency[] = [CONFIG, optionalMetadata, ApiClient]
const factoryProvider: FactoryProvider<Logger> = {
    provide: LOGGER,
    useFactory: (config: AppConfig, metadata?: ModuleMetadata) =>
        new ConsoleLogger(`[${metadata?.id ?? "detached"}] ${config.baseUrl} `),
    inject: [CONFIG, optionalMetadata],
    scope: Scope.Singleton,
}

// 5. existing provider (alias onto an already-registered token)
const existingProvider: ExistingProvider<Logger> = { provide: FEATURE_LOGGER, useExisting: LOGGER }

// Factory helpers, cached in the two ways the package re-exports.
const cachedLogger = SingletonFactory((container) => {
    type _FactoryContainer = Expect<Equals<typeof container, DependencyContainer>>
    return new ConsoleLogger(`${String(container.isRegistered(CONFIG))} `)
})
const conditionalLogger = ConditionalFactory(() => true, ConsoleLogger, ConsoleLogger)
const cachedLoggerProvider: FactoryProvider<Logger> = { provide: LOGGER, useFactory: cachedLogger }

// Negative space: the provider unions must stay discriminated in the emitted declarations.

// @ts-expect-error a class provider has no `inject` — that field belongs to factory providers only.
const classProviderWithInject: ClassProvider<UserStore> = { provide: UserStore, useClass: UserStore, inject: [CONFIG] }
void classProviderWithInject

// @ts-expect-error `resolutionScoped` is not part of the scope model.
const resolutionScopedFactory: FactoryProvider<Logger> = { provide: LOGGER, useFactory: cachedLogger, scope: "resolutionScoped" }
void resolutionScopedFactory

// @ts-expect-error `containerScoped` is not part of the scope model.
const containerScopedClass: ClassProvider<UserStore> = { provide: UserStore, useClass: UserStore, scope: "containerScoped" }
void containerScopedClass

// @ts-expect-error the scope model is exactly `singleton | transient` (plus the raw `Scope.*` values).
const removedScope: ProviderScope = "containerScoped"
void removedScope

// @ts-expect-error `useValue` must match the token's type.
const mistypedValueProvider: ValueProvider<AppConfig> = { provide: CONFIG, useValue: { baseUrl: "x" } }
void mistypedValueProvider

const moduleProviders: Provider[] = [
    constructorProvider,
    classProvider,
    valueProvider,
    factoryProvider,
    existingProvider,
    cachedLoggerProvider,
    Diagnostics,
    PluginRegistry,
    AppClock,
]

// Props bridge
// ========================================

const userAdapter: PropsAdapter<UserProps, UserVM> = {
    create: (initial) => {
        type _AdapterCreateInitial = Expect<Equals<typeof initial, UserProps>>
        return { id: initial.userId, take: initial.limit ?? 20 }
    },
    update: ({ current, next }) => {
        type _AdapterUpdateCurrent = Expect<Equals<typeof current, UserVM>>
        type _AdapterUpdateNext = Expect<Equals<typeof next, UserProps>>
        current.id = next.userId
        current.take = next.limit ?? 20
        return current
    },
}

const USER_VM = Token<PropsRef<UserVM>>("consumer.user-vm")

// createModule
// ========================================

// (a) params object, no options — `T` defaults to `P`.
const UserModule = createModule<UserProps>({
    id: "user",
    providers: moduleProviders,
    onModuleInit: (container) => {
        type _ModuleInitContainer = Expect<Equals<typeof container, DependencyContainer>>
        void container
    },
})
type _UserModuleProps = Expect<Equals<typeof UserModule, ComponentType<UserProps & { children?: ReactNode }>>>
type _UserModuleIsNotAny = Expect<Not<IsAny<typeof UserModule>>>

// (b) params derived from props — the callback parameter must be `P`, not `any`.
const UserFactoryModule = createModule<UserProps>((props) => {
    type _CreateModuleParamsProps = Expect<Equals<typeof props, UserProps>>
    type _CreateModuleParamsPropsAreNotAny = Expect<Not<IsAny<typeof props>>>
    return {
        id: `user-${props.userId}`,
        providers: moduleProviders,
        rebuildOn: [props.userId, props.limit],
    }
})
type _UserFactoryModuleProps = Expect<Equals<typeof UserFactoryModule, ComponentType<UserProps & { children?: ReactNode }>>>

// (c) `{ adapter, token }` — the component's props stay `P` while the bridged value becomes `T`.
const UserVMModule = createModule<UserProps, UserVM>(
    { providers: moduleProviders },
    { adapter: userAdapter, token: USER_VM }
)
type _UserVMModuleProps = Expect<Equals<typeof UserVMModule, ComponentType<UserProps & { children?: ReactNode }>>>

// (d) no arguments at all — a module that only owns a scope.
const BareModule = createModule()

// The module component's props are exactly `P & { children?: ReactNode }`.

// @ts-expect-error `userId` is required; a widening of the props to `any` would drop this error.
const moduleMissingRequiredProp = <UserModule limit={1} />
void moduleMissingRequiredProp

// @ts-expect-error `nope` is not a prop of the module.
const moduleUnknownProp = <UserModule userId="u-1" nope />
void moduleUnknownProp

// @ts-expect-error `userId` is a string.
const moduleMistypedProp = <UserModule userId={1} />
void moduleMistypedProp

// Typed parameter values, so the parameter unions stay pinned as well.
const createParams: CreateModuleParams<UserProps> = (props) => ({ id: `user-${props.userId}`, providers: [ApiClient] })
const rootParams: RootModuleParams = { root: true, providers: [ApiClient] }
const scopedParams: ScopedModuleParams = { providers: [ApiClient], rebuildOn: [1, "a"] }
const factoryParams: FactoryModuleParams = { factory: () => Container.createChildContainer(), providers: [ApiClient] }
const resolutionParams: ModuleResolutionParams = rootParams
const providerProps: ModuleProviderProps = { root: true, providers: [ApiClient], children: null }

const moduleHook: ModuleHook = (container) => {
    type _ModuleHookContainer = Expect<Equals<typeof container, DependencyContainer>>
    void container
}

const moduleHooks: ModuleHooks = { onModuleInit: moduleHook, onModuleDestroy: moduleHook }

declare const someResolution: ModuleResolution
type _ModuleResolutionShape = Expect<Equals<typeof someResolution, { container: DependencyContainer; id: string }>>

// One container = one module: `container` is not a module parameter in any mode, so a module can never
// be pointed at somebody else's container. These directives are the regression guard — if the key ever
// becomes assignable again, TypeScript reports each one as unused and this file stops compiling.

// @ts-expect-error `container` is not a module parameter.
const containerParams: ModuleResolutionParams = { container: Container.createChildContainer() }
void containerParams

// Not merely an excess-property error on a fresh literal: it must fail for an object that already
// partially matches the (otherwise weak) scoped params type too.
// @ts-expect-error `container` is not a module parameter, and a known key alongside it does not help.
const containerWithKnownKey: ModuleResolutionParams = { id: "x", container: Container.createChildContainer() }
void containerWithKnownKey

// @ts-expect-error a scoped module has no `container` either.
const scopedWithContainer: ScopedModuleParams = { container: Container.createChildContainer() }
void scopedWithContainer

// @ts-expect-error root and factory modes are mutually exclusive.
const rootWithFactory: RootModuleParams = { root: true, factory: () => Container.createChildContainer() }
void rootWithFactory

// Nameability of inferred types — TS2742
// ========================================
//
// Wrapping one of our hooks in an EXPORTED hook of its own is the ordinary consumer pattern, and it
// forces TypeScript to write our inferred type into the consumer's declaration output. If that type
// lives in a `dist` file the `exports` map does not publish, TypeScript cannot name it portably and
// reports TS2742 — which is what `usePropsRef`, `useModuleContext`, `useModule` and `makeTokenizer` all
// did until `UsePropsRefResult`, `ModuleContextValue` and `Tokenizer` were exported from `./types`.
//
// These wrappers are therefore UNANNOTATED on purpose: each one only compiles because the inferred type
// is nameable through the published surface. Un-exporting any of those types fails right here, e.g.
//
//   src/repro.tsx: error TS2742: The inferred type of 'useUserBridge' cannot be named without a
//   reference to '../node_modules/@luminelabs/react-di/dist/react/hooks/usePropsRef.js'.
//
// (`@ts-expect-error` cannot pin these: it does suppress TS2742, but the "unused directive" check
// ignores declaration diagnostics and then flags the directive as unused.)

export function useUserBridge(props: UserProps) {
    return usePropsRef(props)
}

export function useCurrentModule() {
    return useModuleContext()
}

export const consumerToken = makeTokenizer("@consumer")

export type ModuleContextShape = {
    container: DependencyContainer
    id: string
    rebuild: () => void
}

export function useAppModuleContext(): ModuleContextShape {
    return useModuleContext()
}

export function useAppModule(): ModuleContextShape {
    return useModule(scopedParams)
}

export const scopedTokenizer: Tokenizer = makeTokenizer("@consumer.scoped")

// Components
// ========================================

function UserPanel(props: UserProps): ReactElement {
    // The manual bridge — the same inference `createModule` performs internally.
    const { ref, provider } = usePropsRef(props)

    type _PropsRefIsTyped = Expect<Equals<typeof ref, PropsRef<UserProps>>>
    type _PropsRefIsNotAny = Expect<Not<IsAny<typeof ref>>>
    type _PropsRefIsNotPropsRefAny = Expect<Not<Equals<typeof ref, PropsRef<any>>>>
    type _PropsRefProvider = Expect<Equals<typeof provider, ValueProvider<PropsRef<UserProps>>>>

    const current = ref.current
    type _PropsRefCurrent = Expect<Equals<typeof current, UserProps>>

    // @ts-expect-error `nope` is not on UserProps — this is the line that dies first if `PropsRef` widens.
    void current.nope

    const off = ref.onUpdate((next) => void next)
    type _PropsRefOff = Expect<Equals<typeof off, () => void>>

    // Adapter form: the bridged type comes from the adapter's output, not from the props.
    const bridged = usePropsRef(props, { adapter: userAdapter, token: USER_VM })
    type _AdaptedRef = Expect<Equals<typeof bridged.ref, PropsRef<UserVM>>>
    type _AdaptedProvider = Expect<Equals<typeof bridged.provider, ValueProvider<PropsRef<UserVM>>>>

    const vm = bridged.ref.current
    type _AdaptedCurrent = Expect<Equals<typeof vm, UserVM>>

    // The same result reached through a consumer-owned wrapper hook (see the TS2742 block above).
    type UserBridge = ReturnType<typeof useUserBridge>
    type _CustomHookResult = Expect<
        Equals<UserBridge, { ref: PropsRef<UserProps>; provider: ValueProvider<PropsRef<UserProps>> }>
    >

    return <div data-user={current.userId} data-take={vm.take} data-token={String(provider.provide)} onBlur={off} />
}

function UserView(): ReactElement {
    // Class token.
    const store = useResolve(UserStore)
    type _ResolveByClass = Expect<Equals<typeof store, UserStore>>
    type _ResolveByClassIsNotAny = Expect<Not<IsAny<typeof store>>>

    // Symbol token minted by `Token()`.
    const config = useResolve(CONFIG)
    type _ResolveBySymbol = Expect<Equals<typeof config, AppConfig>>
    type _ResolveBySymbolIsNotAny = Expect<Not<IsAny<typeof config>>>

    // The non-recursive overload must not change the resolved type.
    const ownConfig = useTryResolve(CONFIG, false)
    type _TryResolveBySymbol = Expect<Equals<typeof ownConfig, AppConfig | undefined>>

    const maybeStore = useTryResolve(UserStore)
    type _TryResolveByClass = Expect<Equals<typeof maybeStore, UserStore | undefined>>

    const plugins = useResolveAll(PLUGIN)
    type _ResolveAllBySymbol = Expect<Equals<typeof plugins, Plugin[]>>
    type _ResolveAllIsNotAny = Expect<Not<IsAny<typeof plugins>>>

    const firstPlugin = plugins[0]
    type _ResolveAllIndexed = Expect<Equals<typeof firstPlugin, Plugin | undefined>>

    const registries = useResolveAll(PluginRegistry, false)
    type _ResolveAllByClass = Expect<Equals<typeof registries, PluginRegistry[]>>

    const container = useContainer()
    type _UseContainer = Expect<Equals<typeof container, DependencyContainer>>

    const rebuild = useModuleRebuild()
    type _UseModuleRebuild = Expect<Equals<typeof rebuild, () => void>>

    const moduleContext = useModuleContext()
    type _UseModuleContext = Expect<Equals<typeof moduleContext, ModuleContextValue>>
    type _ModuleContextShape = Expect<
        Equals<ModuleContextValue, { container: DependencyContainer; id: string; rebuild: () => void }>
    >

    // @ts-expect-error resolution is typed by the token — `nope` does not exist on UserStore.
    void store.nope

    return (
        <button type="button" onClick={rebuild}>
            {store.userId}
            {config.baseUrl}
            {ownConfig?.retries ?? 0}
            {maybeStore ? "y" : "n"}
            {firstPlugin?.name ?? ""}
            {registries.length}
            {moduleContext.id}
            {String(container.isRegistered(UserStore))}
        </button>
    )
}

function TeardownView(): ReactElement {
    const teardown = useResolve(AsyncTeardown)
    type _ResolveAsyncTeardown = Expect<Equals<typeof teardown, AsyncTeardown>>

    const cleanup: CleanupFn = async () => {
        await Promise.resolve()
    }
    const syncCleanup: CleanupFn = () => {}

    const off = useAsyncTeardown(cleanup, 10)
    type _UseAsyncTeardownResult = Expect<Equals<typeof off, () => void>>

    const manualOff = teardown.add(syncCleanup, 5)
    type _AsyncTeardownAdd = Expect<Equals<typeof manualOff, () => void>>

    const runAll = () => teardown.run()
    type _AsyncTeardownRun = Expect<Equals<ReturnType<typeof runAll>, Promise<void>>>

    return (
        <button
            type="button"
            onClick={() => {
                off()
                manualOff()
                void runAll()
            }}
        />
    )
}

// `rebuildOn` — the module is rebuilt when any dependency identity changes.
function RebuildingModule({ children }: { children?: ReactNode }): ReactElement {
    const [version, setVersion] = useState(0)
    const [tenant, setTenant] = useState<string | null>(null)

    return (
        <ModuleProvider providers={[ApiClient, valueProvider]} rebuildOn={[version, tenant]} onModuleDestroy={moduleHook}>
            <button
                type="button"
                onClick={() => {
                    setVersion((current) => current + 1)
                    setTenant("acme")
                }}
            />
            {children}
        </ModuleProvider>
    )
}

// The low-level hook behind `ModuleProvider`, exported for advanced consumers.
function ManualModule({ children }: { children?: ReactNode }): ReactElement {
    const module = useModule(scopedParams)
    type _UseModuleResult = Expect<
        Equals<typeof module, { container: DependencyContainer; id: string; rebuild: () => void }>
    >

    return <div data-module={module.id}>{children}</div>
}

// ModuleProvider — root, scoped and factory modes.
// ========================================

export function App(): ReactElement {
    return (
        // root mode: a fresh container detached from any ancestor.
        <ModuleProvider root id="app-root" providers={moduleProviders} onModuleInit={moduleHook}>
            {/* scoped mode (the default): a fresh child container under the enclosing module. */}
            <ModuleProvider providers={[classProvider, existingProvider]} rebuildOn={["tenant-a"]}>
                <UserModule userId="u-1" limit={25}>
                    <UserPanel userId="u-1" limit={25} />
                    <UserView />
                    <TeardownView />
                </UserModule>

                <UserVMModule userId="u-2">
                    <UserView />
                </UserVMModule>

                <UserFactoryModule userId="u-3" />

                <BareModule>
                    <RebuildingModule>
                        <ManualModule />
                    </RebuildingModule>
                </BareModule>
            </ModuleProvider>

            {/* factory mode: the module adopts and owns the container the factory builds. */}
            <ModuleProvider factory={() => Container.createChildContainer()} providers={[ApiClient]}>
                <UserView />
            </ModuleProvider>
        </ModuleProvider>
    )
}

// `container` is not a prop. The trap this guards against: TypeScript's excess-property check against a
// union accepts any key present in ANY member, so the key has to be absent-or-`never` in ALL of them.

const externalContainer: DependencyContainer = Container.createChildContainer()

// @ts-expect-error `container` is not a module prop — one container = one module.
const containerElement = <ModuleProvider container={externalContainer} />
void containerElement

// @ts-expect-error still not a prop next to a valid one.
const containerWithProvidersElement = <ModuleProvider container={externalContainer} providers={[ApiClient]} />
void containerWithProvidersElement

// @ts-expect-error not a prop in root mode either.
const rootContainerElement = <ModuleProvider root container={externalContainer} />
void rootContainerElement

// @ts-expect-error the JSX spread path must reject it too.
const spreadContainerElement = <ModuleProvider {...{ container: externalContainer }} />
void spreadContainerElement

// Container utilities — the same resolution semantics outside React.
// ========================================

export function inspect(container: DependencyContainer): string {
    const api = resolve(container, ApiClient)
    type _Resolve = Expect<Equals<typeof api, ApiClient>>

    const maybeConfig = tryResolve(container, CONFIG, false)
    type _TryResolve = Expect<Equals<typeof maybeConfig, AppConfig | undefined>>

    const plugins = resolveAll(container, PLUGIN)
    type _ResolveAll = Expect<Equals<typeof plugins, Plugin[]>>

    const fallbackConfig: AppConfig = { baseUrl: "", retries: 0 }
    const configOrValue = resolveOr(container, CONFIG, fallbackConfig)
    type _ResolveOrValue = Expect<Equals<typeof configOrValue, AppConfig>>

    // A thunk fallback must infer its RETURN type, not the function itself. The lazy overload is declared
    // before the eager one for exactly this reason — a thunk satisfies `fallback: F` too, so with the
    // eager overload first this used to infer `AppConfig | (() => null)` while the runtime called the
    // thunk and returned `null`.
    const configOrLazy = resolveOr(container, CONFIG, () => null)
    type _ResolveOrLazy = Expect<Equals<typeof configOrLazy, AppConfig | null>>

    return [
        String(api),
        String(maybeConfig?.retries ?? 0),
        String(plugins.length),
        configOrValue.baseUrl,
        String(configOrLazy),
    ].join("|")
}

// Alias surface — the re-exported tsyringe pieces are public API too.
// ========================================

const globalContainer: DependencyContainer = Container
const registrationOptions: RegistrationOptions = { lifecycle: Scope.Singleton }
const frequency: Frequency = "Once"
const disposable: Disposable = { dispose: () => Promise.resolve() }

type _ScopeValues = Expect<
    Equals<
        typeof Scope,
        {
            readonly Transient: typeof Scope.Transient
            readonly Singleton: typeof Scope.Singleton
        }
    >
>

// Every re-exported value is touched once, so a dropped export breaks here rather than in an app.
const aliasSurface = [
    Container,
    Injectable,
    Singleton,
    Inject,
    InjectAll,
    InjectWithTransform,
    InjectAllWithTransform,
    Delay,
    Scope,
    SingletonFactory,
    ConditionalFactory,
] as const

// The `./types` subpath must carry the entire public type surface. Every exported name is referenced
// once; the length assertion means an ADDED export also lands here, as a deliberate decision rather
// than an accident.
type PublicTypeSurface = [
    DependencyContainer,
    InjectionToken<AppConfig>,
    RegistrationOptions,
    Frequency,
    Disposable,
    RootModuleParams,
    FactoryModuleParams,
    ScopedModuleParams,
    ModuleResolutionParams,
    ModuleResolution,
    ModuleHook,
    ModuleHooks,
    ProviderLifecycle,
    OptionalFactoryDependency<AppConfig>,
    FactoryDependency,
    ClassProvider<UserStore>,
    ValueProvider<AppConfig>,
    FactoryProvider<Logger>,
    ExistingProvider<Logger>,
    Provider,
    CleanupFn,
    PropsAdapter<UserProps, UserVM>,
    ModuleProviderProps,
    CreateModuleParams<UserProps>,
    CreateModuleOptions<UserProps, UserVM>,
    ModuleContextValue,
    UsePropsRefOptions<UserProps, UserVM>,
    UsePropsRefResult<UserVM>,
    ProviderScope,
    TokenOptions,
    Tokenizer,
    Constructor<ApiClient>,
]
// 33 → 32: `InheritModuleParams` left with the removal of container adoption — one container = one module.
type _PublicTypeSurfaceSize = Expect<Equals<PublicTypeSurface["length"], 32>>

// Keep the module-scope constants that exist only to be typechecked from being flagged as dead by a
// future `noUnusedLocals`, and give the file a single exported value to hang everything on.
export const consumerSurface = {
    aliasSurface,
    conditionalLogger,
    createParams,
    disposable,
    factoryDependencies,
    factoryParams,
    frequency,
    globalContainer,
    moduleHooks,
    providerProps,
    registrationOptions,
    resolutionParams,
    scopedParams,
    DUPLICATE_PLUGIN,
} as const
