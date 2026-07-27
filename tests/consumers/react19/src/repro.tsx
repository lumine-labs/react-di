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

// Not required by the package any more — Inversify carries its own metadata and never reads
// `design:paramtypes` — but decorator-using apps still commonly load it, and the consumer declares it.
import "reflect-metadata"

import { useState } from "react"
import type { ComponentType, ReactElement, ReactNode } from "react"

import {
    Container,
    Inject,
    InjectAll,
    Injectable,
    LazyToken,
    ModuleMetadata,
    ModuleProvider,
    ModuleRegistry,
    Optional,
    PropsRef,
    Resolver,
    Scope,
    Token,
    createModule,
    decorate,
    makeTokenizer,
    useContainer,
    useModule,
    useModuleContext,
    useModuleRebuild,
    usePropsRef,
    useResolve,
    useResolveAll,
    useResolveSafe,
} from "@luminelabs/react-di"

// The `./types` subpath has to carry the whole type surface on its own — a consumer that only wants
// types must never have to reach into `.` or into `dist/`.
import type {
    AbstractConstructor,
    ClassProvider,
    Constructor,
    CreateModuleOptions,
    CreateModuleParams,
    ExistingProvider,
    FactoryDependency,
    FactoryModuleParams,
    FactoryProvider,
    InjectionToken,
    ModuleContextValue,
    ModuleErrorHook,
    ModuleHook,
    ModuleHooks,
    ModuleMetadataInit,
    ModuleMetadataProvider,
    ModulePhase,
    ModuleProviderProps,
    ModuleResolution,
    ModuleResolutionParams,
    OptionalFactoryDependency,
    PropsAdapter,
    Provider,
    ProviderLifecycle,
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

// An abstract class is a legal token too — that is what `AbstractConstructor` is in the union for.
abstract class LoggerPort implements Logger {
    abstract log(message: string): void
}
const abstractToken: InjectionToken<LoggerPort> = LoggerPort
const abstractCtor: AbstractConstructor<LoggerPort> = LoggerPort
void abstractToken

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
// auto-registered bridge. Every parameter carries its own token: nothing here depends on
// `design:paramtypes`, so the same code compiles under a bundler that strips decorator metadata.
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

// The three system providers a consumer is allowed to inject.
@Injectable()
class Diagnostics {
    constructor(
        @Inject(ModuleMetadata) private readonly metadata: ModuleMetadata,
        @Inject(ModuleRegistry) private readonly registry: ModuleRegistry,
        @Inject(Resolver) private readonly resolver: Resolver,
        @Inject(LOGGER) @Optional() private readonly logger: Logger | undefined
    ) {}

    describe(): string {
        const id = this.metadata.id
        type _MetadataId = Expect<Equals<typeof id, string>>

        const ownContainer = this.metadata.container
        type _MetadataContainer = Expect<Equals<typeof ownContainer, Container>>

        const parent = this.metadata.parent
        type _MetadataParent = Expect<Equals<typeof parent, Container | null>>

        const children = this.metadata.children
        type _MetadataChildren = Expect<Equals<typeof children, ReadonlySet<Container>>>

        // A declared snapshot, not the providers themselves — one entry per registration.
        const declared = this.metadata.providers
        type _MetadataProviders = Expect<Equals<typeof declared, readonly ModuleMetadataProvider[]>>

        const committed = this.metadata.committed
        type _MetadataCommitted = Expect<Equals<typeof committed, boolean>>

        const store = this.resolver.resolve(UserStore)
        type _ResolverResolve = Expect<Equals<typeof store, UserStore>>

        const maybeLogger = this.resolver.resolveSafe(LOGGER, false)
        type _ResolverResolveSafe = Expect<Equals<typeof maybeLogger, Logger | undefined>>

        const allPlugins = this.resolver.resolveAll(PLUGIN)
        type _ResolverResolveAll = Expect<Equals<typeof allPlugins, Plugin[]>>

        return [
            id,
            String(children.size),
            String(declared.length),
            String(committed),
            store.userId,
            maybeLogger ? "y" : "n",
            String(allPlugins.length),
            this.logger ? "y" : "n",
            this.walk(),
        ].join("/")
    }

    // ModuleRegistry is the module tree, exposed as containers.
    walk(): string {
        const parent = this.registry.parent()
        type _RegistryParent = Expect<Equals<typeof parent, Container | null>>

        const ancestors = this.registry.ancestors()
        type _RegistryAncestors = Expect<Equals<typeof ancestors, Container[]>>

        const root = this.registry.findRoot()
        type _RegistryFindRoot = Expect<Equals<typeof root, Container>>
        type _RegistryFindRootIsNotNullable = Expect<Not<Equals<typeof root, Container | null>>>

        const children = this.registry.children()
        type _RegistryChildren = Expect<Equals<typeof children, Container[]>>

        const descendants = this.registry.descendants()
        type _RegistryDescendants = Expect<Equals<typeof descendants, Container[]>>

        const byId = this.registry.findAncestorById("app-root")
        type _RegistryFindAncestorById = Expect<Equals<typeof byId, Container | null>>

        const descendantById = this.registry.findDescendantById("user")
        type _RegistryFindDescendantById = Expect<Equals<typeof descendantById, Container | null>>

        const owner = this.registry.findAncestorByProvider(CONFIG)
        type _RegistryFindAncestorByProvider = Expect<Equals<typeof owner, Container | null>>

        const holders = this.registry.findDescendantsByProvider(PLUGIN)
        type _RegistryFindDescendantsByProvider = Expect<Equals<typeof holders, Container[]>>

        return [
            parent ? "p" : "-",
            String(ancestors.length),
            String(root.isRegistered(CONFIG)),
            String(children.length),
            String(descendants.length),
            byId ? "y" : "n",
            descendantById ? "y" : "n",
            owner ? "y" : "n",
            String(holders.length),
        ].join("/")
    }
}

// `LazyToken` breaks a construction cycle: a thunk, evaluated when the binding is resolved.
@Injectable()
class PluginRegistry {
    constructor(
        @InjectAll(PLUGIN) readonly plugins: Plugin[],
        @Inject(LazyToken(() => ApiClient)) readonly api: ApiClient
    ) {}
}

// The decorator surface is re-exported from the container library, so its declarations reach the
// consumer through OUR `dist` — and a decorator that arrives as `any` accepts anything, silently. That
// is not a compile error anywhere; it is only visible as an assertion. `skipLibCheck` (which every real
// app sets) hides the underlying "cannot find module" completely, so this is the only place it shows.
const lazyApiToken = LazyToken(() => ApiClient)
type _LazyTokenIsNotAny = Expect<Not<IsAny<typeof lazyApiToken>>>
type _InjectableIsNotAny = Expect<Not<IsAny<typeof Injectable>>>
type _InjectIsNotAny = Expect<Not<IsAny<typeof Inject>>>
type _InjectAllIsNotAny = Expect<Not<IsAny<typeof InjectAll>>>
type _OptionalIsNotAny = Expect<Not<IsAny<typeof Optional>>>
type _DecorateIsNotAny = Expect<Not<IsAny<typeof decorate>>>
void lazyApiToken

// The bundler path: no decorator syntax at all, the same metadata applied by hand. This is the shape
// a consumer needs when the build strips decorators (esbuild, SWC without the legacy transform).
class ManuallyDecorated {
    constructor(readonly api: ApiClient) {}
}
decorate(Injectable(), ManuallyDecorated)
decorate(Inject(ApiClient), ManuallyDecorated, 0)

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

// A lazy class provider: registered now, constructed on first resolve instead of in the eager pass.
const lazyClassProvider: ClassProvider<PluginRegistry> = {
    provide: PluginRegistry,
    useClass: PluginRegistry,
    lazy: true,
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

// The scope model is exactly two strings, and `Scope.*` is nothing but those strings. Note where the
// type comes from: `Scope` is the one type a provider literal needs that `./types` does not re-export,
// so a types-only consumer has to reach into the root entry for it.
type _ScopeUnion = Expect<Equals<Scope, "singleton" | "transient">>
type _ScopeValues = Expect<
    Equals<
        typeof Scope,
        {
            readonly Singleton: "singleton"
            readonly Transient: "transient"
        }
    >
>
const transientProvider: ClassProvider<ApiClient> = { provide: ApiClient, useClass: ApiClient, scope: Scope.Transient }

// Negative space: the provider unions must stay discriminated in the emitted declarations.

// @ts-expect-error a class provider has no `inject` — that field belongs to factory providers only.
const classProviderWithInject: ClassProvider<UserStore> = { provide: UserStore, useClass: UserStore, inject: [CONFIG] }
void classProviderWithInject

// @ts-expect-error a value provider is already an instance — there is nothing to defer.
const lazyValueProvider: ValueProvider<AppConfig> = { provide: CONFIG, useValue: valueProvider.useValue, lazy: true }
void lazyValueProvider

// @ts-expect-error `resolutionScoped` is not part of the scope model.
const resolutionScopedFactory: FactoryProvider<Logger> = { provide: LOGGER, useFactory: () => new ConsoleLogger(""), scope: "resolutionScoped" }
void resolutionScopedFactory

// @ts-expect-error `containerScoped` is not part of the scope model.
const containerScopedClass: ClassProvider<UserStore> = { provide: UserStore, useClass: UserStore, scope: "containerScoped" }
void containerScopedClass

// @ts-expect-error the scope model is exactly `singleton | transient`.
const removedScope: Scope = "containerScoped"
void removedScope

// @ts-expect-error the tsyringe-era enum member is gone with the lifecycle model that had it.
void Scope.ContainerScoped

// @ts-expect-error `useValue` must match the token's type.
const mistypedValueProvider: ValueProvider<AppConfig> = { provide: CONFIG, useValue: { baseUrl: "x" } }
void mistypedValueProvider

const moduleProviders: Provider[] = [
    constructorProvider,
    classProvider,
    lazyClassProvider,
    valueProvider,
    factoryProvider,
    existingProvider,
    Diagnostics,
    UserStore,
    ManuallyDecorated,
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
        type _ModuleInitContainer = Expect<Equals<typeof container, Container>>
        void container
    },
    onModuleError: (phase, error) => {
        type _ModuleErrorPhase = Expect<Equals<typeof phase, ModulePhase>>
        type _ModuleErrorPhaseValues = Expect<Equals<ModulePhase, "init" | "mount" | "unmount" | "destroy">>
        type _ModuleErrorReason = Expect<Equals<typeof error, unknown>>
        void error
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

// @ts-expect-error the adapter's input is the component's props, not the bridged type.
const mismatchedAdapterModule = createModule<UserProps, UserVM>({}, { adapter: { create: (initial: UserVM) => initial, update: ({ current }) => current } })
void mismatchedAdapterModule

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
const createOptions: CreateModuleOptions<UserProps, UserVM> = { adapter: userAdapter, token: USER_VM }
const rootParams: RootModuleParams = { root: true, providers: [ApiClient] }
const scopedParams: ScopedModuleParams = { providers: [ApiClient], rebuildOn: [1, "a"] }
const factoryParams: FactoryModuleParams = { factory: () => new Container(), providers: [ApiClient] }
const resolutionParams: ModuleResolutionParams = rootParams
const providerProps: ModuleProviderProps = { root: true, providers: [ApiClient], children: null }

const moduleHook: ModuleHook = (container) => {
    type _ModuleHookContainer = Expect<Equals<typeof container, Container>>
    void container
}

const moduleErrorHook: ModuleErrorHook = (phase, error) => {
    type _ErrorHookPhase = Expect<Equals<typeof phase, ModulePhase>>
    void phase
    void error
}

const moduleHooks: ModuleHooks = {
    onModuleInit: moduleHook,
    onModuleDestroy: moduleHook,
    onModuleError: moduleErrorHook,
}

declare const someResolution: ModuleResolution
type _ModuleResolutionShape = Expect<Equals<typeof someResolution, { container: Container; id: string }>>

// One container = one module: `container` is not a module parameter in any mode, so a module can never
// be pointed at somebody else's container. These directives are the regression guard — if the key ever
// becomes assignable again, TypeScript reports each one as unused and this file stops compiling.

// @ts-expect-error `container` is not a module parameter.
const containerParams: ModuleResolutionParams = { container: new Container() }
void containerParams

// Not merely an excess-property error on a fresh literal: it must fail for an object that already
// partially matches the (otherwise weak) scoped params type too.
// @ts-expect-error `container` is not a module parameter, and a known key alongside it does not help.
const containerWithKnownKey: ModuleResolutionParams = { id: "x", container: new Container() }
void containerWithKnownKey

// @ts-expect-error a scoped module has no `container` either.
const scopedWithContainer: ScopedModuleParams = { container: new Container() }
void scopedWithContainer

// @ts-expect-error root and factory modes are mutually exclusive.
const rootWithFactory: RootModuleParams = { root: true, factory: () => new Container() }
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

export function useOwnContainer() {
    return useContainer()
}

export const consumerToken = makeTokenizer("@consumer")

export type ModuleContextShape = {
    container: Container
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
    type _CustomHookIsTheDeclaredResult = Expect<Equals<UserBridge, UsePropsRefResult<UserProps>>>

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
    const ownConfig = useResolveSafe(CONFIG, false)
    type _ResolveSafeBySymbol = Expect<Equals<typeof ownConfig, AppConfig | undefined>>

    const maybeStore = useResolveSafe(UserStore)
    type _ResolveSafeByClass = Expect<Equals<typeof maybeStore, UserStore | undefined>>

    const plugins = useResolveAll(PLUGIN)
    type _ResolveAllBySymbol = Expect<Equals<typeof plugins, Plugin[]>>
    type _ResolveAllIsNotAny = Expect<Not<IsAny<typeof plugins>>>

    const firstPlugin = plugins[0]
    type _ResolveAllIndexed = Expect<Equals<typeof firstPlugin, Plugin | undefined>>

    const registries = useResolveAll(PluginRegistry)
    type _ResolveAllByClass = Expect<Equals<typeof registries, PluginRegistry[]>>

    // @ts-expect-error `useResolveAll` takes a token and nothing else — the `recursive` parameter is gone.
    void useResolveAll(PLUGIN, false)

    const container = useContainer()
    type _UseContainer = Expect<Equals<typeof container, Container>>

    const rebuild = useModuleRebuild()
    type _UseModuleRebuild = Expect<Equals<typeof rebuild, () => void>>

    const moduleContext = useModuleContext()
    type _UseModuleContext = Expect<Equals<typeof moduleContext, ModuleContextValue>>
    type _ModuleContextShape = Expect<
        Equals<ModuleContextValue, { container: Container; id: string; rebuild: () => void }>
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

// `rebuildOn` — the module is rebuilt when any dependency identity changes.
function RebuildingModule({ children }: { children?: ReactNode }): ReactElement {
    const [version, setVersion] = useState(0)
    const [tenant, setTenant] = useState<string | null>(null)

    return (
        <ModuleProvider
            providers={[ApiClient, valueProvider]}
            rebuildOn={[version, tenant]}
            onModuleDestroy={moduleHook}
            onModuleError={moduleErrorHook}
        >
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
    type _UseModuleResult = Expect<Equals<typeof module, { container: Container; id: string; rebuild: () => void }>>

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
            <ModuleProvider factory={() => new Container()} providers={[ApiClient]}>
                <UserView />
            </ModuleProvider>
        </ModuleProvider>
    )
}

// `container` is not a prop. The trap this guards against: TypeScript's excess-property check against a
// union accepts any key present in ANY member, so the key has to be absent-or-`never` in ALL of them.

const externalContainer: Container = new Container()

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

// Container — the same resolution semantics outside React.
// ========================================

export function inspect(container: Container): string {
    const child = container.fork()
    type _Fork = Expect<Equals<typeof child, Container>>

    child.register([ApiClient, valueProvider])
    child.register(factoryProvider)

    const api = child.resolve(ApiClient)
    type _Resolve = Expect<Equals<typeof api, ApiClient>>

    const maybeConfig = child.resolveSafe(CONFIG, false)
    type _ResolveSafe = Expect<Equals<typeof maybeConfig, AppConfig | undefined>>

    const plugins = child.resolveAll(PLUGIN)
    type _ResolveAll = Expect<Equals<typeof plugins, Plugin[]>>

    const registered = child.isRegistered(CONFIG, false)
    type _IsRegistered = Expect<Equals<typeof registered, boolean>>

    child.onResolution(CONFIG, (instance) => {
        type _OnResolutionInstance = Expect<Equals<typeof instance, AppConfig>>
        void instance
    })

    const fallbackConfig: AppConfig = { baseUrl: "", retries: 0 }
    const configOrValue = child.resolveOr(CONFIG, fallbackConfig)
    type _ResolveOrValue = Expect<Equals<typeof configOrValue, AppConfig>>

    // A thunk fallback must infer its RETURN type, not the function itself. The lazy overload is declared
    // before the eager one for exactly this reason — a thunk satisfies `fallback: F` too, so with the
    // eager overload first this used to infer `AppConfig | (() => null)` while the runtime called the
    // thunk and returned `null`.
    const configOrLazy = child.resolveOr(CONFIG, () => null)
    type _ResolveOrLazy = Expect<Equals<typeof configOrLazy, AppConfig | null>>

    return [
        String(api),
        String(maybeConfig?.retries ?? 0),
        String(plugins.length),
        String(registered),
        configOrValue.baseUrl,
        String(configOrLazy),
    ].join("|")
}

// `ModuleMetadata` is constructible by a consumer building a container by hand.
const metadataInit: ModuleMetadataInit = { id: "manual", container: new Container(), parent: null }

// A container is constructed, never forked off a package-level singleton.

// @ts-expect-error there is no global container and no `createChildContainer` on the class.
void Container.createChildContainer()

// @ts-expect-error `LazyToken` is a function that builds a deferred identifier, not a class.
void new LazyToken(() => ApiClient)

// The published surface, counted.
// ========================================
//
// Every exported VALUE is touched once, so a dropped export breaks here rather than in an app, and the
// length assertion means an ADDED export lands here too — as a deliberate decision rather than an
// accident. The type surface below gets the same treatment.

const publicValueSurface = [
    Container,
    Scope,
    Inject,
    InjectAll,
    Injectable,
    LazyToken,
    Optional,
    decorate,
    ModuleProvider,
    createModule,
    useModule,
    useContainer,
    useModuleContext,
    useModuleRebuild,
    useResolve,
    useResolveSafe,
    useResolveAll,
    usePropsRef,
    ModuleMetadata,
    ModuleRegistry,
    Resolver,
    PropsRef,
    Token,
    makeTokenizer,
] as const
type _PublicValueSurfaceSize = Expect<Equals<typeof publicValueSurface.length, 24>>

// The `./types` subpath must carry the entire public type surface. Every exported name is referenced
// once.
type PublicTypeSurface = [
    AbstractConstructor<Logger>,
    ClassProvider<UserStore>,
    Constructor<ApiClient>,
    ExistingProvider<Logger>,
    FactoryDependency,
    FactoryProvider<Logger>,
    InjectionToken<AppConfig>,
    OptionalFactoryDependency<AppConfig>,
    Provider,
    ValueProvider<AppConfig>,
    FactoryModuleParams,
    ModuleResolution,
    ModuleResolutionParams,
    RootModuleParams,
    ScopedModuleParams,
    ModuleErrorHook,
    ModuleHook,
    ModuleHooks,
    ModulePhase,
    ProviderLifecycle,
    ModuleMetadataInit,
    ModuleMetadataProvider,
    PropsAdapter<UserProps, UserVM>,
    ModuleContextValue,
    ModuleProviderProps,
    CreateModuleOptions<UserProps, UserVM>,
    CreateModuleParams<UserProps>,
    UsePropsRefOptions<UserProps, UserVM>,
    UsePropsRefResult<UserVM>,
    TokenOptions,
    Tokenizer,
]
// 32 -> 31 on the move to Inversify: `DependencyContainer`, `RegistrationOptions`, `Frequency`,
// `Disposable`, `CleanupFn` and `ProviderScope` left with tsyringe; `AbstractConstructor`,
// `ModuleErrorHook`, `ModulePhase`, `ModuleMetadataInit` and `ModuleMetadataProvider` arrived with the
// container we now own.
type _PublicTypeSurfaceSize = Expect<Equals<PublicTypeSurface["length"], 31>>

// Keep the module-scope constants that exist only to be typechecked from being flagged as dead by a
// future `noUnusedLocals`, and give the file a single exported value to hang everything on.
export const consumerSurface = {
    abstractCtor,
    createOptions,
    createParams,
    factoryDependencies,
    factoryParams,
    metadataInit,
    moduleHooks,
    providerProps,
    resolutionParams,
    scopedParams,
    transientProvider,
    valueSurfaceSize: publicValueSurface.length,
    DUPLICATE_PLUGIN,
} as const
