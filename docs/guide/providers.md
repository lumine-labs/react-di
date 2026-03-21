# Providers

`Provider` supports constructor and explicit provider objects.

## Forms

- Class constructor.
- `ClassProvider` via `useClass`.
- `ValueProvider` via `useValue`.
- `FactoryProvider` via `useFactory`.
- `ExistingProvider` via `useExisting`.

## Scope

Supported scopes:

- `singleton` (default)
- `transient`
- `containerScoped`
- `resolutionScoped` (not supported for factory provider)

## Example

```ts
const providers: Provider[] = [
    LoggerService,
    { provide: API_URL, useValue: "https://api.example.com" },
    { provide: HttpClient, useClass: HttpClient, scope: "singleton" },
]
```
