/**
 * Type-regression consumer.
 *
 * This file is compiled against the PUBLISHED declarations — `node_modules/@remodulo/react/dist`,
 * installed from the packed package, never from `src` and never through a path alias. `npm run
 * typecheck` in the repo root only proves `src/` is self-consistent under our own tsconfig; this proves
 * the emitted `.d.ts` still means something in somebody else's project.
 *
 * Nothing here runs. `tsc --noEmit` is the entire test, and two kinds of assertion carry the weight:
 *
 *   1. `Expect<Equals<A, B>>` — pins an INFERRED type exactly. The dangerous regression is not a
 *      compile error, it is a silent widening to `any`: `createModuleComponent<UserProps>()` handing back
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

// The package was `@luminelabs/react-di` until the 2026-08-01 rename to `@remodulo/react`; specifier only.
import {
    App,
    AppProvider,
    Container,
    Inject,
    InjectAll,
    Injectable,
    LazyToken,
    Module,
    ModuleProvider,
    ModuleRegistry,
    Optional,
    PropsRef,
    Ref,
    RefMap,
    RegistrationMode,
    ResolveAllMode,
    ResolveMode,
    Resolver,
    Scope,
    Token,
    createFeature,
    createModuleComponent,
    decorate,
    makeTokenizer,
    useContainer,
    useModuleContext,
    useModuleRebuild,
    usePropsRef,
    useResolve,
    useResolveAll,
    useResolveOptional,
} from "@remodulo/react"

// The `./types` subpath has to carry the whole type surface on its own — a consumer that only wants
// types must never have to reach into `.` or into `dist/`.
import type {
    AbstractConstructor,
    AppProviderProps,
    ClassProvider,
    Constructor,
    CreateModuleComponentOptions,
    CreateModuleComponentParams,
    ExistingProvider,
    FactoryDependency,
    FactoryProvider,
    Feature,
    InjectionToken,
    ModuleContextValue,
    ModuleHook,
    ModuleHooks,
    ModuleParams,
    ModuleProviderProps,
    MultiFactoryDependency,
    OptionalFactoryDependency,
    PropsAdapter,
    Provider,
    ProviderInput,
    ProviderLifecycle,
    SelfClassProvider,
    TokenClassProvider,
    TokenOptions,
    Tokenizer,
    UsePropsRefOptions,
    UsePropsRefResult,
    ValueProvider,
} from "@remodulo/react/types"

// Assertion helpers — zero dependency on purpose.
// ========================================

// The strict equality trick: two deferred conditionals are assignable to each other only when `A` and
// `B` are the *identical* type, so `any` never sneaks through as "close enough".
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type IsAny<T> = 0 extends 1 & T ? true : false
type Not<T extends boolean> = T extends true ? false : true
type Expect<T extends true> = T
type HasKey<T, K extends PropertyKey> = K extends keyof T ? true : false

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

// The view model an adapter produces: the `T !== P` shape of `usePropsRef` / `createModuleComponent`.
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

// The system providers a consumer is allowed to inject. `Module` is the substrate: injecting it reaches
// the module instance and its container directly, where injecting `ModuleMetadata` used to.
@Injectable()
class Diagnostics {
    constructor(
        @Inject(Module) private readonly module: Module,
        @Inject(ModuleRegistry) private readonly registry: ModuleRegistry,
        @Inject(Resolver) private readonly resolver: Resolver,
        @Inject(LOGGER) @Optional() private readonly logger: Logger | undefined
    ) {}

    describe(): string {
        const id = this.module.id
        type _ModuleId = Expect<Equals<typeof id, string>>

        const ownContainer = this.module.container
        type _ModuleContainer = Expect<Equals<typeof ownContainer, Container>>

        // The parent is a Module now, not a bare Container — the tree is modules all the way up.
        const parent = this.module.parent
        type _ModuleParent = Expect<Equals<typeof parent, Module | null>>

        const children = this.module.children
        type _ModuleChildren = Expect<Equals<typeof children, ReadonlySet<Module>>>

        // A declared snapshot, not the providers themselves — one entry per registration. `ProviderSnapshot`
        // is deliberately NOT on the public surface, so the shape is pinned through the token it carries.
        const declared = this.module.providers
        type _ModuleProvidersIsNotAny = Expect<Not<IsAny<typeof declared>>>
        const declaredToken = declared[0]?.token
        type _ProviderSnapshotToken = Expect<Equals<typeof declaredToken, InjectionToken<unknown> | undefined>>

        // `committed` is gone; the module exposes `initialized` / `mounted` instead.
        const initialized = this.module.initialized
        type _ModuleInitialized = Expect<Equals<typeof initialized, boolean>>

        const mounted = this.module.mounted
        type _ModuleMounted = Expect<Equals<typeof mounted, boolean>>

        const store = this.resolver.resolve(UserStore)
        type _ResolverResolve = Expect<Equals<typeof store, UserStore>>

        // `Resolver` mirrors `Container`'s read surface exactly, mode parameters included — a narrower
        // signature here is a silent divergence, so both families are pinned through it.
        const maybeLogger = this.resolver.resolveOptional(LOGGER, "self")
        type _ResolverResolveOptional = Expect<Equals<typeof maybeLogger, Logger | undefined>>
        type _ResolverResolveMode = Expect<Equals<Parameters<Resolver["resolveOptional"]>[1], ResolveMode | undefined>>

        // `isRegistered` is the one read that does NOT take `ResolveMode`: it asks a registration question,
        // not a resolution one, so it takes `RegistrationMode`. The two unions are structurally identical
        // today, so this pin cannot tell them apart — it holds the SHAPE, and the name is what documents the
        // axis. What it does catch is the union growing on one side: `"chained"` is refused below.
        type _ResolverIsRegisteredMode = Expect<
            Equals<Parameters<Resolver["isRegistered"]>[1], RegistrationMode | undefined>
        >

        const allPlugins = this.resolver.resolveAll(PLUGIN)
        type _ResolverResolveAll = Expect<Equals<typeof allPlugins, Plugin[]>>
        type _ResolverResolveAllMode = Expect<
            Equals<Parameters<Resolver["resolveAll"]>[1], ResolveAllMode | undefined>
        >

        const nearestPlugins = this.resolver.resolveAll(PLUGIN, "nearest")
        type _ResolverResolveAllNearest = Expect<Equals<typeof nearestPlugins, Plugin[]>>
        void nearestPlugins

        return [
            id,
            String(children.size),
            String(declared.length),
            String(initialized),
            String(mounted),
            store.userId,
            maybeLogger ? "y" : "n",
            String(allPlugins.length),
            this.logger ? "y" : "n",
            String(declaredToken),
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

// `Injectable` takes nothing. Inversify's `injectable(scope?)` accepts a scope, but that channel is dead
// here — `Container.register()` always sets the binding scope explicitly, and an explicit binding scope
// beats the decorator's default — so an argument would be silently ignored rather than obeyed. Scope
// belongs to the registration (`{ useClass: X, scope: Scope.Transient }`), so the arity is the API.

// @ts-expect-error `Injectable` takes no arguments — scope lives on the provider, not on the class.
void Injectable("Transient")

// @ts-expect-error and no other argument gets in either.
void Injectable(Scope.Transient)

// `InjectAll` sits on the other inversify option channel. `multiInject(token, { chained })` defaults to
// UNCHAINED, which disagreed with `resolveAll` the moment a token was declared in both a module and an
// ancestor. Ours takes the same MODES as every other multi read, with the same default and the same
// meaning — one semantics parameterized uniformly, not a second option channel.
const injectAllDefault = InjectAll(PLUGIN)
const injectAllChained = InjectAll(PLUGIN, "chained")
const injectAllNearest = InjectAll(PLUGIN, "nearest")
const injectAllMember = InjectAll(PLUGIN, ResolveAllMode.Nearest)
type _InjectAllReturns = Expect<Equals<typeof injectAllDefault, typeof injectAllNearest>>
void [injectAllDefault, injectAllChained, injectAllNearest, injectAllMember]

// The decorator's union is `ResolveAllMode` MINUS `"self"`, and the narrowing is load-bearing rather than
// an oversight: injection resolves inside inversify's planner, which has chained and unchained
// `multiInject` and nothing narrower, so own-only injection is not expressible at all. The type says so.
type _InjectAllMode = Expect<Equals<Parameters<typeof InjectAll>[1], "nearest" | "chained" | undefined>>

// @ts-expect-error the planner cannot do own-only injection, so `"self"` is not one of the decorator's modes.
void InjectAll(PLUGIN, "self")

// @ts-expect-error and neither is the enum member that spells it.
void InjectAll(PLUGIN, ResolveAllMode.Self)

// The inversify options OBJECT stays rejected — a mode string is the only shape.
// @ts-expect-error chained-ness is not a per-site options object.
void InjectAll(PLUGIN, { chained: true })

// @ts-expect-error not even the value that used to be the default.
void InjectAll(PLUGIN, { chained: false })

// Element holders — Ref / RefMap, and the subclass-as-token pattern.
// ========================================
//
// Each subclass is its own class and therefore its own injection token, which is how "one element per
// token" is spelled with no token ceremony. No `@Injectable()` on either: a zero-dependency class carries
// no constructor metadata for inversify to want (MEASURED against 8.2.3 through the real
// `register()` + `resolve()` path). The decorator only becomes necessary once a subclass takes constructor
// parameters, exactly like any other class.

class InputRef extends Ref<HTMLInputElement> {}
class FieldRefs extends RefMap<HTMLInputElement> {}
class RowRefs extends RefMap<HTMLTableRowElement, number> {}

declare const inputRef: InputRef
declare const fieldRefs: FieldRefs
declare const rowRefs: RowRefs

// The holder is typed by the type parameter, and starts null.
const heldInput = inputRef.current
type _RefCurrent = Expect<Equals<typeof heldInput, HTMLInputElement | null>>
type _RefCurrentIsNotAny = Expect<Not<IsAny<typeof heldInput>>>

// `set` is what goes on the `ref` prop: a callback taking the element or null and returning nothing. The
// void return is load-bearing on React 19, which reads any other return value as a cleanup function.
type _RefSet = Expect<Equals<typeof inputRef.set, (value: HTMLInputElement | null) => void>>

const attachInput = <input ref={inputRef.set} />
void attachInput

// No negative pin for the wrong element type on purpose: `<div ref={inputRef.set} />` is an error under
// @types/react 19 but NOT under 18, whose `RefCallback` is declared through the bivariance hack and so
// accepts any element-shaped callback. The mismatch is caught for React 19 consumers and silently is not
// for React 18 ones — a typings fact, not something the holder can fix, and this file has to compile
// identically under both. `_RefSet` above is the assertion that actually holds everywhere.

// RefMap keys default to string, and `set(key)` hands back the same per-key callback shape.
const attachField = fieldRefs.set("email")
type _RefMapSet = Expect<Equals<typeof attachField, (element: HTMLInputElement | null) => void>>

const heldField = fieldRefs.get("email")
type _RefMapGet = Expect<Equals<typeof heldField, HTMLInputElement | null>>

const allFields = fieldRefs.all()
type _RefMapAll = Expect<Equals<typeof allFields, ReadonlyMap<string, HTMLInputElement>>>

// @ts-expect-error `all()` is a read-only view — the map is not the place to attach elements.
allFields.set("email", null as unknown as HTMLInputElement)

// The second type parameter moves the key off `string`.
type _RefMapKeyed = Expect<Equals<ReturnType<typeof rowRefs.all>, ReadonlyMap<number, HTMLTableRowElement>>>

// @ts-expect-error a number-keyed RefMap does not take a string key.
void rowRefs.set("1")

const attachRow = <tr ref={rowRefs.set(1)} />
void attachRow

// Both are ordinary class providers: bare constructor, or `useClass` with a scope.
const refProviders: Provider[] = [InputRef, FieldRefs, { useClass: RowRefs, scope: Scope.Transient }]
const refClassProvider: ClassProvider<InputRef> = { provide: InputRef, useClass: InputRef }
void refClassProvider

// And the point of all of it: a service reaches the element through DI instead of through props. The
// subclass is the token, so `@Inject(InputRef)` says which element without a symbol in sight.
@Injectable()
class FocusManager {
    constructor(
        @Inject(InputRef) private readonly input: InputRef,
        @Inject(FieldRefs) private readonly fields: FieldRefs
    ) {}

    onModuleMount(): void {
        // Populated by now: refs attach in the commit, modules mount in a passive effect.
        this.input.current?.focus()
    }

    focusField(key: string): void {
        this.fields.get(key)?.focus()
    }
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

// A lazy class provider: registered now, constructed on first resolve instead of in the eager pass.
const lazyClassProvider: ClassProvider<PluginRegistry> = {
    provide: PluginRegistry,
    useClass: PluginRegistry,
    lazy: true,
}

// The same shape with `provide` left out: the class registers under itself, which is what the bare
// constructor does — except the options are available here. `ClassProvider` names both spellings, so no
// second type joined the surface to pay for the sugar.
const shorthandClassProvider: ClassProvider<ManuallyDecorated> = { useClass: ManuallyDecorated }
const lazyShorthandProvider: ClassProvider<PluginRegistry> = { useClass: PluginRegistry, lazy: true }
const transientShorthandProvider: ClassProvider<ApiClient> = { useClass: ApiClient, scope: Scope.Transient }
void lazyShorthandProvider
void transientShorthandProvider

// And it is a `Provider` in its own right, options and all.
const shorthandInUnion: Provider = { useClass: PluginRegistry, scope: "singleton", lazy: true }
void shorthandInUnion

// 3. value provider
const valueProvider: ValueProvider<AppConfig> = {
    provide: CONFIG,
    useValue: { baseUrl: "https://api.example.com", retries: 2 },
}

// 4. factory provider, with `inject` (a required and an optional dependency). The optional dependency is
// the module instance itself — reached through the `Module` token, the way factories used to reach
// `ModuleMetadata`.
const optionalModule: OptionalFactoryDependency<Module> = { token: Module, optional: true }
const factoryDependencies: FactoryDependency[] = [CONFIG, optionalModule, ApiClient]
const factoryProvider: FactoryProvider<Logger> = {
    provide: LOGGER,
    useFactory: (config: AppConfig, module?: Module) =>
        new ConsoleLogger(`[${module?.id ?? "detached"}] ${config.baseUrl} `),
    inject: [CONFIG, optionalModule],
    scope: Scope.Singleton,
}

// 5. existing provider (alias onto an already-registered token)
const existingProvider: ExistingProvider<Logger> = { provide: FEATURE_LOGGER, useExisting: LOGGER }

// The scope model is exactly three strings, and `Scope.*` is nothing but those strings. Note where the
// type comes from: `Scope` is the one type a provider literal needs that `./types` does not re-export,
// so a types-only consumer has to reach into the root entry for it.
// 2 -> 3 with `request`, one instance per resolution graph. The surface counts below are untouched:
// `Scope` was already exported under both meanings, and a third member is not a third name.
type _ScopeUnion = Expect<Equals<Scope, "singleton" | "transient" | "request">>
type _ScopeValues = Expect<
    Equals<
        typeof Scope,
        {
            readonly Singleton: "singleton"
            readonly Transient: "transient"
            readonly Request: "request"
        }
    >
>
const transientProvider: ClassProvider<ApiClient> = { provide: ApiClient, useClass: ApiClient, scope: Scope.Transient }
const requestProvider: ClassProvider<ApiClient> = { provide: ApiClient, useClass: ApiClient, scope: Scope.Request }
const requestLiteralProvider: ClassProvider<ApiClient> = { provide: ApiClient, useClass: ApiClient, scope: "request" }
const requestShorthandProvider: ClassProvider<ApiClient> = { useClass: ApiClient, scope: "request" }
const requestFactoryProvider: FactoryProvider<Logger> = {
    provide: LOGGER,
    useFactory: () => new ConsoleLogger(""),
    scope: Scope.Request,
}
const requestMultiProvider: Provider = { provide: PLUGIN, useClass: PluginRegistry, multi: true, scope: "request" }
const requestLazyProvider: Provider = { provide: ApiClient, useClass: ApiClient, scope: Scope.Request, lazy: true }
void requestLiteralProvider
void requestShorthandProvider
void requestFactoryProvider
void requestMultiProvider
void requestLazyProvider

// The read modes are declared the same way and reach consumers the same way: an `Enum` whose members ARE
// the strings, so a member and a bare literal are interchangeable at every call site.
type _ResolveModeUnion = Expect<Equals<ResolveMode, "self" | "nearest">>
type _ResolveAllModeUnion = Expect<Equals<ResolveAllMode, "self" | "nearest" | "chained">>
type _RegistrationModeUnion = Expect<Equals<RegistrationMode, "self" | "nearest">>
type _ResolveModeValues = Expect<
    Equals<
        typeof ResolveMode,
        {
            readonly Self: "self"
            readonly Nearest: "nearest"
        }
    >
>
type _RegistrationModeValues = Expect<
    Equals<
        typeof RegistrationMode,
        {
            readonly Self: "self"
            readonly Nearest: "nearest"
        }
    >
>
type _ResolveAllModeValues = Expect<
    Equals<
        typeof ResolveAllMode,
        {
            readonly Self: "self"
            readonly Nearest: "nearest"
            readonly Chained: "chained"
        }
    >
>

// A single read has two modes, not three. One value cannot be accumulated, so `"chained"` would have no
// meaning to give it — and the type refuses it rather than silently treating it as the default.
// @ts-expect-error `chained` is a collection width; a single read has nothing to accumulate.
const chainedSingleMode: ResolveMode = "chained"
void chainedSingleMode

// @ts-expect-error the boolean the modes replaced is gone from every read surface.
const legacyRecursiveFlag: ResolveMode = true
void legacyRecursiveFlag

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

// @ts-expect-error the scope model is exactly `singleton | transient | request`.
const removedScope: Scope = "containerScoped"
void removedScope

// @ts-expect-error the tsyringe-era enum member is gone with the lifecycle model that had it.
void Scope.ContainerScoped

// @ts-expect-error `useValue` must match the token's type.
const mistypedValueProvider: ValueProvider<AppConfig> = { provide: CONFIG, useValue: { baseUrl: "x" } }
void mistypedValueProvider

// The class-only restriction, pinned. `provide` is optional for `useClass` because a class is its own
// token; every other form has no token to derive, so dropping `provide` there must stay an error. These
// four assertions are what stops optional-`provide` from leaking across the union.

// @ts-expect-error a value has no derivable token — `provide` stays required.
const provideLessValue: Provider = { useValue: { baseUrl: "x", retries: 0 } }
void provideLessValue

// @ts-expect-error a factory has no derivable token either.
const provideLessFactory: Provider = { useFactory: () => new ConsoleLogger("") }
void provideLessFactory

// @ts-expect-error an alias needs both ends named; the target is not the token.
const provideLessExisting: Provider = { useExisting: LOGGER }
void provideLessExisting

// The same three under their own type names, where `provide` is plainly a required field.
// @ts-expect-error ValueProvider requires `provide`.
const provideLessValueProvider: ValueProvider<AppConfig> = { useValue: { baseUrl: "x", retries: 0 } }
void provideLessValueProvider

// Exactly one implementation key. Each form declares all four and forbids the three it is not, so a mixed
// provider is rejected AT the offending key rather than bouncing off the union as a whole. Verbatim, for
// the first of these:
//
//   Type '{ provide: symbol; useClass: typeof ConsoleLogger; useValue: ConsoleLogger; }' is not
//   assignable to type 'Provider'.
//     Types of property 'useValue' are incompatible.
//       Type 'ConsoleLogger' is not assignable to type 'undefined'.
//
// That second line is the whole point of the matrix: the diagnostic names the key you got wrong.

// @ts-expect-error a class provider cannot also carry a value.
const classAndValue: Provider = { provide: LOGGER, useClass: ConsoleLogger, useValue: new ConsoleLogger("") }
void classAndValue

// @ts-expect-error a factory provider cannot also be an alias.
const factoryAndExisting: Provider = { provide: FEATURE_LOGGER, useFactory: () => 1, useExisting: LOGGER }
void factoryAndExisting

// @ts-expect-error dropping `provide` is not a licence to add a stray implementation key.
const shorthandAndValue: Provider = { useClass: ApiClient, useValue: 1 }
void shorthandAndValue

// Multi-providers — `multi: true`.
// ========================================
//
// A token is either a single registration or a collection, never both, and which of the two it is is a
// property of the whole container chain, settled at registration. That makes the guards holding the
// contract up — `resolve` on a collection, `resolveAll` on a single registration, an alias TARGETING a
// collection — runtime errors by nature; none of them can be pinned from here. What the types owe is
// exactly this much: `multi: true` on the four forms that name a token, and nowhere else.

class FeaturePlugin implements Plugin {
    readonly name = "feature"
}

const multiClass: ClassProvider<Plugin> = { provide: PLUGIN, useClass: FeaturePlugin, multi: true }
const multiValue: ValueProvider<Plugin> = { provide: PLUGIN, useValue: new FeaturePlugin(), multi: true }
const multiFactory: FactoryProvider<Plugin> = { provide: PLUGIN, useFactory: () => new FeaturePlugin(), multi: true }
const multiExisting: ExistingProvider<Plugin> = { provide: PLUGIN, useExisting: FeaturePlugin, multi: true }

const notMulti: ClassProvider<Plugin> = { provide: PLUGIN, useClass: FeaturePlugin, multi: false }
const notMultiShorthand: ClassProvider<Plugin> = { useClass: FeaturePlugin, multi: false }

const multiInUnion: Provider[] = [multiClass, multiValue, multiFactory, multiExisting, notMulti, notMultiShorthand]
void multiInUnion

// The shorthand is the one class spelling that cannot join a collection. It registers the class under
// ITSELF, and a collection whose only member is that class is just the class — so `multi: true` requires
// an explicit `provide`, and the two class spellings differ by more than a keystroke.

// @ts-expect-error the provide-less `useClass` shorthand cannot carry `multi`.
const multiShorthand: Provider = { useClass: FeaturePlugin, multi: true }
void multiShorthand

// @ts-expect-error the same under the form's own name, where both class spellings are in view.
const multiShorthandClassProvider: ClassProvider<Plugin> = { useClass: FeaturePlugin, multi: true }
void multiShorthandClassProvider

// @ts-expect-error a value provider still needs its token, `multi` or not.
const provideLessMultiValue: Provider = { useValue: new FeaturePlugin(), multi: true }
void provideLessMultiValue

// Reaching a collection from a factory — the `inject` grammar.
// ========================================
//
// An entry is a bare token or one of two NAMED object arms discriminated by `multi`, each excluding what
// the other owns — the same diagonal the provider grammar uses, not an anonymous intersection. The arms
// exist because `mode` is not one type here: a collection read has three modes and a single read has two,
// so the enum `mode` is drawn from follows the discriminant.
//
// Note what is NOT pinned below: `useFactory` is `(...args: any[]) => T`, so the parameters are not
// inferred from the `inject` tuple and there is no inferred-argument type to assert. Annotating them, as
// `factoryProvider` above does, is the whole of the typing a consumer gets.

const requiredDependency: OptionalFactoryDependency<Plugin> = { token: PLUGIN }
const optionalDependency: OptionalFactoryDependency<Plugin> = { token: PLUGIN, optional: true }
const selfDependency: OptionalFactoryDependency<Plugin> = { token: PLUGIN, mode: "self" }
const collectionDependency: MultiFactoryDependency<Plugin> = { token: PLUGIN, multi: true }
const chainedDependency: MultiFactoryDependency<Plugin> = { token: PLUGIN, multi: true, mode: ResolveAllMode.Chained }

// All of them are `FactoryDependency`s, alongside the bare-token shorthand.
const injectGrammar: FactoryDependency[] = [
    PLUGIN,
    requiredDependency,
    optionalDependency,
    selfDependency,
    collectionDependency,
    chainedDependency,
]
void injectGrammar

// And they are accepted inline, where excess-property checking against the union does the real work.
const collectingFactory: FactoryProvider<Plugin[]> = {
    provide: Token<Plugin[]>("consumer.plugin.snapshot"),
    useFactory: (plugins: Plugin[]) => plugins,
    inject: [{ token: PLUGIN, multi: true, mode: "nearest" }],
}
void collectingFactory

// @ts-expect-error `optional` is not on the collection arm: `resolveAll` on an unregistered token reads
// `[]`, so there is no missing state to opt into.
const optionalCollection: FactoryDependency = { token: PLUGIN, multi: true, optional: true }
void optionalCollection

// @ts-expect-error the collection arm takes `ResolveAllMode` and nothing else.
const bogusCollectionMode: FactoryDependency = { token: PLUGIN, multi: true, mode: "bogus" }
void bogusCollectionMode

// @ts-expect-error `chained` is the one mode the single arm cannot have — one value has nothing to
// accumulate — and without `multi: true` this is the single arm.
const chainedSingleDependency: FactoryDependency = { token: PLUGIN, mode: "chained" }
void chainedSingleDependency

// The same refusal reached through the provider, where the array element is what gets checked.
const chainedInsideProvider: FactoryProvider<Plugin> = {
    provide: PLUGIN,
    useFactory: () => new FeaturePlugin(),
    // @ts-expect-error `chained` on an entry with no `multi: true`.
    inject: [{ token: PLUGIN, mode: "chained" }],
}
void chainedInsideProvider

// Features — provider bundles.
// ========================================
//
// `createFeature` bundles provider inputs behind one value, and `ProviderInput` is `Provider | Feature`, so
// features nest. The bundle is flattened where a module is CONSTRUCTED, which is the only place the widening
// reaches: every params surface takes `readonly ProviderInput[]`, and `Container.register` still takes
// providers alone.

const LOGGING_FEATURE = createFeature({ providers: [factoryProvider, existingProvider] })
type _CreateFeatureReturnsFeature = Expect<Equals<typeof LOGGING_FEATURE, Feature>>
type _CreateFeatureIsNotAny = Expect<Not<IsAny<typeof LOGGING_FEATURE>>>

const NAMED_FEATURE = createFeature({ name: "billing", providers: [ApiClient, classProvider] })
const featureName = NAMED_FEATURE.name
type _FeatureName = Expect<Equals<typeof featureName, string | undefined>>

// A feature carries a collection member like any other provider, and features nest.
const PLUGIN_FEATURE = createFeature({ providers: [multiClass, multiValue] })
const ROOT_FEATURE = createFeature({ name: "root", providers: [LOGGING_FEATURE, PLUGIN_FEATURE, valueProvider] })

const featureProviders = ROOT_FEATURE.providers
type _FeatureProviders = Expect<Equals<typeof featureProviders, readonly ProviderInput[]>>

// Both arms of the input union, named.
const providerInputs: readonly ProviderInput[] = [ApiClient, valueProvider, ROOT_FEATURE]
const providerAsInput: ProviderInput = classProvider
void [providerInputs, providerAsInput]

// The params surfaces that widened.
const featureModuleParams: ModuleParams = { id: "featured", providers: [ROOT_FEATURE, ApiClient] }
const featureProviderProps: ModuleProviderProps = { providers: [ROOT_FEATURE], children: null }
void [featureModuleParams, featureProviderProps]

// @ts-expect-error `createFeature` takes a params object — a bare array of providers is not one.
const bareArrayFeature = createFeature([ApiClient])
void bareArrayFeature

// @ts-expect-error `name` is a string when present.
const numericNameFeature = createFeature({ name: 123, providers: [ApiClient] })
void numericNameFeature

// The container API is deliberately NOT widened: a feature is flattened by the module that receives it,
// and `register()` never sees one.

// @ts-expect-error a Feature is not a Provider — `register` takes providers alone.
void new Container().register(ROOT_FEATURE)

// @ts-expect-error and the array form refuses it for the same reason.
void new Container().register([ApiClient, ROOT_FEATURE])

const moduleProviders: Provider[] = [
    constructorProvider,
    classProvider,
    lazyClassProvider,
    valueProvider,
    factoryProvider,
    existingProvider,
    shorthandClassProvider,
    Diagnostics,
    UserStore,
    ManuallyDecorated,
    FocusManager,
    ...refProviders,
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

// createModuleComponent
// ========================================

// (a) params object, no options — `T` defaults to `P`.
const UserModule = createModuleComponent<UserProps>({
    id: "user",
    providers: moduleProviders,
    onModuleInit: (container) => {
        type _ModuleInitContainer = Expect<Equals<typeof container, Container>>
        void container
    },
})
type _UserModuleProps = Expect<Equals<typeof UserModule, ComponentType<UserProps & { children?: ReactNode }>>>
type _UserModuleIsNotAny = Expect<Not<IsAny<typeof UserModule>>>

// (b) params derived from props — the callback parameter must be `P`, not `any`.
const UserFactoryModule = createModuleComponent<UserProps>((props) => {
    type _CreateModuleComponentParamsProps = Expect<Equals<typeof props, UserProps>>
    type _CreateModuleComponentParamsPropsAreNotAny = Expect<Not<IsAny<typeof props>>>
    return {
        id: `user-${props.userId}`,
        providers: moduleProviders,
        rebuildOn: [props.userId, props.limit],
    }
})
type _UserFactoryModuleProps = Expect<Equals<typeof UserFactoryModule, ComponentType<UserProps & { children?: ReactNode }>>>

// (c) `{ adapter, token }` — the component's props stay `P` while the bridged value becomes `T`.
const UserVMModule = createModuleComponent<UserProps, UserVM>(
    { providers: moduleProviders },
    { adapter: userAdapter, token: USER_VM }
)
type _UserVMModuleProps = Expect<Equals<typeof UserVMModule, ComponentType<UserProps & { children?: ReactNode }>>>

// (d) no arguments at all — a module that only owns a scope.
const BareModule = createModuleComponent()

// (e) a feature in `providers` — the bundle flattens at construction, so the component type is unchanged.
const FeaturedModule = createModuleComponent<UserProps>({ providers: [ROOT_FEATURE, ...moduleProviders] })
type _FeaturedModuleProps = Expect<Equals<typeof FeaturedModule, ComponentType<UserProps & { children?: ReactNode }>>>

// @ts-expect-error the adapter's input is the component's props, not the bridged type.
const mismatchedAdapterModule = createModuleComponent<UserProps, UserVM>({}, { adapter: { create: (initial: UserVM) => initial, update: ({ current }) => current } })
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
const createParams: CreateModuleComponentParams<UserProps> = (props) => ({ id: `user-${props.userId}`, providers: [ApiClient] })
const createOptions: CreateModuleComponentOptions<UserProps, UserVM> = { adapter: userAdapter, token: USER_VM }
const moduleParams: ModuleParams = { id: "scoped", providers: [ApiClient] }
const providerProps: ModuleProviderProps = { providers: [ApiClient], rebuildOn: [1, "a"], children: null }

const moduleHook: ModuleHook = (container) => {
    type _ModuleHookContainer = Expect<Equals<typeof container, Container>>
    void container
}

const moduleHooks: ModuleHooks = {
    onModuleInit: moduleHook,
    onModuleDestroy: moduleHook,
}

// Params negative space — the modes are dead, so the keys that pinned them must stay rejected.
// ========================================
//
// `ModuleParams` is exactly id/providers/on* now. The old mode flags (`root`, `factory`) and the
// never-a-param `container` must all be absent, and these directives are the regression guard: if any
// key becomes assignable again, TypeScript reports its directive as unused and the file stops compiling.

type _ModuleParamsHasNoRoot = Expect<Not<HasKey<ModuleParams, "root">>>
type _ModuleParamsHasNoFactory = Expect<Not<HasKey<ModuleParams, "factory">>>
type _ModuleParamsHasNoContainer = Expect<Not<HasKey<ModuleParams, "container">>>

// @ts-expect-error `root` is not a module parameter — the composition root is created imperatively via new App().
const rootModuleParams: ModuleParams = { root: true, providers: [ApiClient] }
void rootModuleParams

// @ts-expect-error `factory` is not a module parameter — factory mode is gone.
const factoryModuleParams: ModuleParams = { factory: () => new Container(), providers: [ApiClient] }
void factoryModuleParams

// @ts-expect-error `container` is not a module parameter — one container = one module.
const containerModuleParams: ModuleParams = { container: new Container() }
void containerModuleParams

// Not merely an excess-property error on a fresh literal: it must fail alongside a known key too.
// @ts-expect-error `container` is not a module parameter, and a known key beside it does not help.
const containerWithKnownKey: ModuleParams = { id: "x", container: new Container() }
void containerWithKnownKey

// The context value is the module instance plus its rebuild — no loose `container` / `id` fields.
type _ModuleContextValueShape = Expect<Equals<ModuleContextValue, { module: Module; rebuild: () => void }>>

// Nameability of inferred types — TS2742
// ========================================
//
// Wrapping one of our hooks in an EXPORTED hook of its own is the ordinary consumer pattern, and it
// forces TypeScript to write our inferred type into the consumer's declaration output. If that type
// lives in a `dist` file the `exports` map does not publish, TypeScript cannot name it portably and
// reports TS2742 — which is what `usePropsRef`, `useModuleContext` and `makeTokenizer` all did until
// `UsePropsRefResult`, `ModuleContextValue` and `Tokenizer` were exported from `./types`.
//
// These wrappers are therefore UNANNOTATED on purpose: each one only compiles because the inferred type
// is nameable through the published surface. Un-exporting any of those types fails right here, e.g.
//
//   src/repro.tsx: error TS2742: The inferred type of 'useUserBridge' cannot be named without a
//   reference to '../node_modules/@remodulo/react/dist/react/hooks/usePropsRef.js'.
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
    module: Module
    rebuild: () => void
}

export function useAppModuleContext(): ModuleContextShape {
    return useModuleContext()
}

export const scopedTokenizer: Tokenizer = makeTokenizer("@consumer.scoped")

// Components
// ========================================

function UserPanel(props: UserProps): ReactElement {
    // The manual bridge — the same inference `createModuleComponent` performs internally.
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

    // The mode must not change the resolved type.
    const ownConfig = useResolveOptional(CONFIG, "self")
    type _ResolveOptionalBySymbol = Expect<Equals<typeof ownConfig, AppConfig | undefined>>
    type _UseResolveMode = Expect<Equals<Parameters<typeof useResolve>[1], ResolveMode | undefined>>
    type _UseResolveOptionalMode = Expect<Equals<Parameters<typeof useResolveOptional>[1], ResolveMode | undefined>>

    const maybeStore = useResolveOptional(UserStore)
    type _ResolveOptionalByClass = Expect<Equals<typeof maybeStore, UserStore | undefined>>

    const plugins = useResolveAll(PLUGIN)
    type _ResolveAllBySymbol = Expect<Equals<typeof plugins, Plugin[]>>
    type _ResolveAllIsNotAny = Expect<Not<IsAny<typeof plugins>>>

    const firstPlugin = plugins[0]
    type _ResolveAllIndexed = Expect<Equals<typeof firstPlugin, Plugin | undefined>>

    const registries = useResolveAll(PluginRegistry)
    type _ResolveAllByClass = Expect<Equals<typeof registries, PluginRegistry[]>>

    // The modes reach the hook surface too — same names, same default, same semantics as every other
    // multi read, and unlike the decorator the hook carries the whole set including `"self"`. None of
    // them changes the resolved type.
    const ownPlugins = useResolveAll(PLUGIN, "self")
    type _ResolveAllOwnOnly = Expect<Equals<typeof ownPlugins, Plugin[]>>

    const nearestPlugins = useResolveAll(PLUGIN, ResolveAllMode.Nearest)
    type _ResolveAllNearest = Expect<Equals<typeof nearestPlugins, Plugin[]>>
    type _UseResolveAllMode = Expect<Equals<Parameters<typeof useResolveAll>[1], ResolveAllMode | undefined>>
    void nearestPlugins

    // @ts-expect-error a mode is a string, not inversify's options object.
    void useResolveAll(PLUGIN, { chained: false })

    const container = useContainer()
    type _UseContainer = Expect<Equals<typeof container, Container>>

    const rebuild = useModuleRebuild()
    type _UseModuleRebuild = Expect<Equals<typeof rebuild, () => void>>

    const moduleContext = useModuleContext()
    type _UseModuleContext = Expect<Equals<typeof moduleContext, ModuleContextValue>>
    type _ModuleContextShape = Expect<Equals<ModuleContextValue, { module: Module; rebuild: () => void }>>

    // The module instance is the context value now — id lives on it, not beside it.
    const ownModule = moduleContext.module
    type _ContextModuleIsModule = Expect<Equals<typeof ownModule, Module>>

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
            {ownModule.id}
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

// The boundary hook is internal now; a consumer reaches its enclosing module straight off context.
function ManualModule({ children }: { children?: ReactNode }): ReactElement {
    const { module, rebuild } = useModuleContext()
    type _ContextModule = Expect<Equals<typeof module, Module>>
    type _ContextRebuild = Expect<Equals<typeof rebuild, () => void>>
    void rebuild

    return <div data-module={module.id}>{children}</div>
}

// Root boundary — created imperatively, outside the tree, then handed to <AppProvider>.
// ========================================

const composedApp = new App({ id: "app-root", providers: moduleProviders, onModuleInit: moduleHook })
type _CreateAppReturnsApp = Expect<Equals<typeof composedApp, App>>
type _CreateAppIsNotAny = Expect<Not<IsAny<typeof composedApp>>>

// An App IS a Module — that subtype relationship is what the whole tree gates on.
const appAsModule: Module = composedApp
void appAsModule

// ...but a bare Module is NOT an App. The App subclass carries a private brand, so it is nominal: the
// substrate cannot masquerade as the composition root, and <AppProvider> cannot be handed a scoped module.
declare const someBareModule: Module
// @ts-expect-error a bare Module is not assignable to App — App is nominal.
const moduleAsApp: App = someBareModule
void moduleAsApp

export function AppTree(): ReactElement {
    return (
        // The composition root: <AppProvider> inits (if needed), mounts and unmounts the owner-created App.
        <AppProvider app={composedApp}>
            {/* scoped (the only) mode: a fresh child container under the enclosing module. */}
            <ModuleProvider providers={[classProvider, existingProvider]} rebuildOn={["tenant-a"]}>
                <UserModule userId="u-1" limit={25}>
                    <UserPanel userId="u-1" limit={25} />
                    <UserView />
                </UserModule>

                <UserVMModule userId="u-2">
                    <UserView />
                </UserVMModule>

                <UserFactoryModule userId="u-3" />

                <FeaturedModule userId="u-4" />

                <BareModule>
                    <RebuildingModule>
                        <ManualModule />
                    </RebuildingModule>
                </BareModule>
            </ModuleProvider>
        </AppProvider>
    )
}

// Module & App classes — construction and lifecycle signatures.
// ========================================

// The Module constructor takes `(parent, params)`; the parent is a Module or null, never optional.
const childModule = new Module(composedApp, { providers: [ApiClient] })
type _NewModuleIsModule = Expect<Equals<typeof childModule, Module>>
const childParent = childModule.parent
type _ModuleParentAccessor = Expect<Equals<typeof childParent, Module | null>>

const detachedModule = new Module(null, { id: "detached" })
void detachedModule

// @ts-expect-error the Module constructor requires the parent argument (Module | null).
const parentlessModule = new Module()
void parentlessModule

// @ts-expect-error a Container is not a Module — the parent slot takes a module or null.
const wrongParentModule = new Module(new Container())
void wrongParentModule

// `App` / `new App(...)` take params only — the root has no parent slot; the subclass pins it to null.
const explicitApp = new App({ id: "app-2" })
type _NewAppIsApp = Expect<Equals<typeof explicitApp, App>>
void explicitApp

// @ts-expect-error App's constructor takes only params — there is no parent argument on the root.
const appWithParent = new App(composedApp, { id: "nope" })
void appWithParent

// Lifecycle phase signatures: init/mount/unmount are sync void, destroy is async.
const initResult: void = composedApp.init()
void initResult
const mountResult: void = composedApp.mount()
void mountResult
const unmountResult: void = composedApp.unmount()
void unmountResult
const destroyResult = composedApp.destroy()
type _DestroyReturnsPromise = Expect<Equals<typeof destroyResult, Promise<void>>>
void destroyResult

const isInitialized = composedApp.initialized
type _InitializedIsBoolean = Expect<Equals<typeof isInitialized, boolean>>
void isInitialized

const isMounted = composedApp.mounted
type _MountedIsBoolean = Expect<Equals<typeof isMounted, boolean>>
void isMounted

// ModuleProvider / AppProvider props — negative space.
// ========================================
//
// ModuleProvider is scoped-only: `container`, `root` and `factory` are all rejected. The trap this
// guards against: TypeScript's excess-property check against a union accepts any key present in ANY
// member, so a removed key has to be absent from the props type entirely.

const externalContainer: Container = new Container()

// @ts-expect-error `container` is not a module prop — one container = one module.
const containerElement = <ModuleProvider container={externalContainer} />
void containerElement

// @ts-expect-error still not a prop next to a valid one.
const containerWithProvidersElement = <ModuleProvider container={externalContainer} providers={[ApiClient]} />
void containerWithProvidersElement

// @ts-expect-error the JSX spread path must reject it too.
const spreadContainerElement = <ModuleProvider {...{ container: externalContainer }} />
void spreadContainerElement

// @ts-expect-error `root` is gone — the composition root is created via new App() + <AppProvider>, not a prop.
const rootPropElement = <ModuleProvider root providers={[ApiClient]} />
void rootPropElement

// @ts-expect-error `factory` is gone with factory mode.
const factoryPropElement = <ModuleProvider factory={() => new Container()} providers={[ApiClient]} />
void factoryPropElement

// AppProvider's props are exactly `{ app, children? }`, and `app` takes either an instance or a factory
// that builds one. The factory overload exists so the App can be constructed inside the provider's own
// hook state instead of at module scope.
type _AppProviderPropsShape = Expect<Equals<AppProviderProps, { app: App | (() => App); children?: ReactNode }>>

// Both accepted forms.
const instanceAppProvider = <AppProvider app={composedApp} />
void instanceAppProvider

const factoryAppProvider = <AppProvider app={() => new App({ providers: [ApiClient] })} />
void factoryAppProvider

// @ts-expect-error AppProvider's `app` must be an App — an arbitrary object is not one.
const badAppProvider = <AppProvider app={{}} />
void badAppProvider

// @ts-expect-error a bare Module is not an App — AppProvider only accepts the nominal composition root.
const bareModuleAppProvider = <AppProvider app={someBareModule} />
void bareModuleAppProvider

// @ts-expect-error a factory has to RETURN an App — one that returns a bare Module is not the overload.
const badFactoryAppProvider = <AppProvider app={() => someBareModule} />
void badFactoryAppProvider

// @ts-expect-error AppProvider requires an `app`.
const emptyAppProvider = <AppProvider />
void emptyAppProvider

// Container — the same resolution semantics outside React.
// ========================================

export function inspect(container: Container): string {
    const child = container.fork()
    type _Fork = Expect<Equals<typeof child, Container>>

    child.register([ApiClient, valueProvider])
    child.register(factoryProvider)

    const api = child.resolve(ApiClient)
    type _Resolve = Expect<Equals<typeof api, ApiClient>>

    const maybeConfig = child.resolveOptional(CONFIG, "self")
    type _ResolveOptional = Expect<Equals<typeof maybeConfig, AppConfig | undefined>>
    type _ContainerResolveMode = Expect<Equals<Parameters<Container["resolve"]>[1], ResolveMode | undefined>>

    const plugins = child.resolveAll(PLUGIN)
    type _ResolveAll = Expect<Equals<typeof plugins, Plugin[]>>

    // The same modes the other multi reads have — `self` is this container's own bindings alone, `nearest`
    // is the substrate's unchained walk with its ancestor fallback. Neither changes what a collection is
    // made of.
    const ownPlugins = child.resolveAll(PLUGIN, "self")
    type _ResolveAllOwn = Expect<Equals<typeof ownPlugins, Plugin[]>>
    type _ContainerResolveAllMode = Expect<Equals<Parameters<Container["resolveAll"]>[1], ResolveAllMode | undefined>>

    const nearestPlugins = child.resolveAll(PLUGIN, ResolveAllMode.Nearest)
    type _ResolveAllNearest = Expect<Equals<typeof nearestPlugins, Plugin[]>>
    void nearestPlugins

    const registered = child.isRegistered(CONFIG, "self")
    type _IsRegistered = Expect<Equals<typeof registered, boolean>>
    type _ContainerIsRegisteredMode = Expect<
        Equals<Parameters<Container["isRegistered"]>[1], RegistrationMode | undefined>
    >

    const registeredByMember = child.isRegistered(CONFIG, RegistrationMode.Nearest)
    type _IsRegisteredByMember = Expect<Equals<typeof registeredByMember, boolean>>
    void registeredByMember

    // @ts-expect-error the `recursive` boolean is gone; a single read takes a mode.
    void child.isRegistered(CONFIG, false)

    // A registration question has no `chained`: there is nothing to accumulate about "is this token
    // registered". The member spelling is refused for the same reason as the literal.

    // @ts-expect-error `chained` is a collection width; `RegistrationMode` has no such member.
    void child.isRegistered(CONFIG, "chained")

    // @ts-expect-error `ResolveAllMode.Chained` is that same string — the enum it came from does not matter.
    void child.isRegistered(CONFIG, ResolveAllMode.Chained)

    child.onResolution(CONFIG, (instance) => {
        type _OnResolutionInstance = Expect<Equals<typeof instance, AppConfig>>
        void instance
    })

    // One observation concept reaches consumers. The predicate-filtered variant the module lifecycle adopts
    // through (`onPredicateResolution`) is `@internal` and removed from the published declarations by
    // `stripInternal` in tsconfig.build.json. `onSingletonResolution` was its earlier, narrower name and is
    // gone outright — neither may appear.
    //
    // THIS PIN IS LOAD-BEARING: it is the only thing holding that flag in place. Drop `stripInternal` and
    // the member reappears in `dist`, the assertion below stops being true, and `typecheck:consumers` goes
    // red — which is exactly the point. Do not "fix" a failure here by deleting the pin.
    type _PublicObservationExists = Expect<HasKey<Container, "onResolution">>
    type _InternalObservationIsHidden = Expect<Not<HasKey<Container, "onPredicateResolution">>>
    type _RenamedObservationIsGone = Expect<Not<HasKey<Container, "onSingletonResolution">>>

    // @ts-expect-error `onPredicateResolution` is internal — it is not on the published Container.
    child.onPredicateResolution(CONFIG, () => undefined, () => true)

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
    ResolveMode,
    ResolveAllMode,
    RegistrationMode,
    Inject,
    InjectAll,
    Injectable,
    LazyToken,
    Optional,
    decorate,
    App,
    Module,
    AppProvider,
    ModuleProvider,
    createFeature,
    createModuleComponent,
    useContainer,
    useModuleContext,
    useModuleRebuild,
    useResolve,
    useResolveOptional,
    useResolveAll,
    usePropsRef,
    ModuleRegistry,
    Resolver,
    PropsRef,
    Ref,
    RefMap,
    Token,
    makeTokenizer,
] as const
// 24 -> 25 on the 0.5.0 rework: `ModuleMetadata` and public `useModule` left with the modes; `App`,
// `Module` and `AppProvider` arrived with the App/Module classes. 25 -> 27 with the element holders,
// `Ref` and `RefMap`. Both are classes, so each is a value and a type under one name — the type surface
// below is unchanged by them, exactly as it is by `PropsRef`. 27 -> 29 when the `recursive` / `chained`
// booleans became `ResolveMode` and `ResolveAllMode`: an `Enum` is a value and a type under one name like
// `Scope`, but unlike `Scope` a consumer annotates with these directly, so they are counted in both lists.
// 29 -> 30 when `isRegistered` moved off `ResolveMode` onto its own `RegistrationMode`: same members as
// `ResolveMode` today, separate enum because it is a registration-axis question rather than a resolution
// one, and a third `Enum` on the same idiom is a third name in both lists. Still 30 after
// `useResolveSafe` -> `useResolveOptional`: a rename replaces a name in this list rather than adding one,
// so the count holding is the evidence that nothing else moved with it. 30 -> 31 with `createFeature`: the
// only value provider bundles add, since a `Feature` is made by that call and never by a constructor.
type _PublicValueSurfaceSize = Expect<Equals<typeof publicValueSurface.length, 31>>

// The `./types` subpath must carry the entire public type surface. Every exported name is referenced
// once.
type PublicTypeSurface = [
    AbstractConstructor<Logger>,
    ClassProvider<UserStore>,
    Constructor<ApiClient>,
    ExistingProvider<Logger>,
    FactoryDependency,
    FactoryProvider<Logger>,
    Feature,
    InjectionToken<AppConfig>,
    MultiFactoryDependency<Plugin>,
    OptionalFactoryDependency<AppConfig>,
    Provider,
    ProviderInput,
    ResolveMode,
    ResolveAllMode,
    RegistrationMode,
    SelfClassProvider<ManuallyDecorated>,
    TokenClassProvider<UserStore>,
    ValueProvider<AppConfig>,
    ModuleParams,
    ModuleHook,
    ModuleHooks,
    ProviderLifecycle,
    PropsAdapter<UserProps, UserVM>,
    ModuleContextValue,
    ModuleProviderProps,
    AppProviderProps,
    CreateModuleComponentOptions<UserProps, UserVM>,
    CreateModuleComponentParams<UserProps>,
    UsePropsRefOptions<UserProps, UserVM>,
    UsePropsRefResult<UserVM>,
    TokenOptions,
    Tokenizer,
]
// 31 -> 26 on the 0.5.0 rework: `FactoryModuleParams`, `ModuleResolution`, `ModuleResolutionParams`,
// `RootModuleParams` and `ScopedModuleParams` left with the modes, and `ModuleMetadataInit` /
// `ModuleMetadataProvider` with the ModuleMetadata concept; `ModuleParams` and `AppProviderProps`
// arrived with the App/Module classes. 26 -> 24 when `onModuleError` was removed, taking
// `ModuleErrorHook` and `ModulePhase` with it. Unchanged by the provide-less `useClass` shorthand: it is
// a second member of `ClassProvider`, not a new name. 24 -> 26 with multi-providers, which turned that
// second member into a second TYPE: `multi: true` requires a `provide` and the shorthand has none, so
// `ClassProvider` is now a union — and a union alias is only portable when a consumer can NAME its
// members. Without these two exports, `export const x = { someClassProvider }` fails to emit its
// declarations with TS2742. 26 -> 28 with the read modes: `ResolveMode` and `ResolveAllMode` are exported
// from `./types` as well as from the root, because a consumer that stores or forwards a mode
// (`function read(mode: ResolveAllMode)`) needs to NAME it, and a types-only consumer has no root import
// to reach for. Pinned here through the root binding, which carries both meanings of each name. 28 -> 29
// with `RegistrationMode`, `isRegistered`'s own mode, for exactly the same reason. 29 -> 30 when a factory
// dependency gained a collection arm: `MultiFactoryDependency` is the same union-member argument as the two
// `ClassProvider` members — `FactoryDependency` is a union, and a consumer storing or forwarding one arm of
// it has to be able to NAME that arm. The value surface is untouched; all three are types only. Still 30
// when `multi: false` became a legal provider spelling: the token-bearing forms widened to `multi?:
// boolean` and the shorthand to `multi?: false`, both inside shapes this list already names. 30 -> 32 with
// provider bundles: `Feature` is what `createFeature` returns and `ProviderInput` is the `Provider | Feature`
// union every params surface now takes, so a consumer that stores or forwards either has to be able to NAME
// it — and `ModuleParams`, already in this list, is unusable without the second.
type _PublicTypeSurfaceSize = Expect<Equals<PublicTypeSurface["length"], 32>>

// The three modes are the only names in that list a consumer imports from the ROOT as values, so the claim
// that `./types` also carries them cannot ride on the import block above. Pinned directly instead.
type _ResolveModeOnTypesSubpath = Expect<Equals<import("@remodulo/react/types").ResolveMode, ResolveMode>>
type _ResolveAllModeOnTypesSubpath = Expect<
    Equals<import("@remodulo/react/types").ResolveAllMode, ResolveAllMode>
>
type _RegistrationModeOnTypesSubpath = Expect<
    Equals<import("@remodulo/react/types").RegistrationMode, RegistrationMode>
>

// Keep the module-scope constants that exist only to be typechecked from being flagged as dead by a
// future `noUnusedLocals`, and give the file a single exported value to hang everything on.
export const consumerSurface = {
    abstractCtor,
    createOptions,
    createParams,
    factoryDependencies,
    moduleHooks,
    moduleParams,
    providerProps,
    transientProvider,
    requestProvider,
    valueSurfaceSize: publicValueSurface.length,
    DUPLICATE_PLUGIN,
} as const
