# Providers

`Provider` defines how a token is registered in a module container.

## Supported Forms

1. Constructor provider (`MyService`)
2. `useClass`
3. `useValue`
4. `useFactory`
5. `useExisting`

## Scope

Supported values:

- `singleton` (default)
- `transient`
- `containerScoped`
- `resolutionScoped` (not supported for `useFactory`)

`scope` also accepts raw `Scope.*` aliases from tsyringe.

## Registration Examples

```ts
const providers: Provider[] = [
    LoggerService,
    { provide: API_URL, useValue: "https://api.example.com" },
    { provide: HttpClient, useClass: HttpClient, scope: "singleton" },
    {
        provide: FeatureClient,
        useFactory: (apiUrl: string, logger?: LoggerService) => new FeatureClient(apiUrl, logger),
        inject: [API_URL, { token: LoggerService, optional: true }],
        scope: "containerScoped",
    },
    { provide: AliasToken, useExisting: LoggerService },
]
```

## Factory Dependencies

For `useFactory`, dependencies are resolved from `inject` in order:

- `InjectionToken` -> required dependency
- `{ token, optional: true }` -> returns `undefined` if token is absent

The current container object is intentionally **not** passed into factory arguments.
