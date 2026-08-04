# @coexist/angular

> Angular bindings for [Coexist](../../README.md): an environment provider and `inject*` helpers that expose a Coexist app (or a worker-hosted app) as Angular signals.

## Installation

```sh
pnpm add @coexist/angular @coexist/core
```

Peer dependency: `@angular/core` `>=17 <23`.

## Quick start

Register the app with `provideCoexist(app)` during bootstrap, then inject the module and signals inside components.

```ts
import { Component } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { injectModule, injectSignal, provideCoexist } from "@coexist/angular";

@Component({
  selector: "counter-view",
  template: `<button (click)="counter.increase()">{{ count() }}</button>`,
})
class CounterView {
  readonly counter = injectModule(Counter);
  readonly count = injectSignal(Counter, (module) => module.count);
}

bootstrapApplication(CounterView, {
  providers: [provideCoexist(app)],
});
```

`injectSignal` returns a read-only Angular `Signal<T>` — call it (`count()`) in the template.

## API

| Function                         | Returns                | Description                     |
| -------------------------------- | ---------------------- | ------------------------------- |
| `provideCoexist(app)`            | `EnvironmentProviders` | Register the app for DI.        |
| `injectCoexistApp()`             | `App`                  | Inject the app.                 |
| `injectModule(token)`            | `T`                    | Inject the bound module facade. |
| `injectSignal(fn, opts?)`        | `Signal<T>`            | Signal for `fn(app)`.           |
| `injectSignal(token, fn, opts?)` | `Signal<TValue>`       | Signal for `fn(module, app)`.   |

`injectSignal` accepts `{ equals }` (defaults to `Object.is`) and unsubscribes automatically through `DestroyRef`. It must run in an injection context.

## Worker-hosted state

`injectWorkerSignal` reads the client snapshot synchronously, so it throws until the host's first snapshot arrives. Await `client.ready` before bootstrapping components that use it; `injectWorkerModule` is safe at any time.

```ts
import { Component } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { injectWorkerModule, injectWorkerSignal, provideWorkerClient } from "@coexist/angular";

type CounterState = { readonly counter: { readonly count: number } };

@Component({
  selector: "counter-view",
  template: `<button (click)="counter.increase()">{{ count() }}</button>`,
})
class WorkerCounterView {
  readonly counter = injectWorkerModule<Counter>("counter");
  readonly count = injectWorkerSignal((state) => (state as CounterState).counter.count);
}

bootstrapApplication(WorkerCounterView, {
  providers: [provideWorkerClient(client)],
});
```

- `provideWorkerClient(client)` → `EnvironmentProviders`.
- `injectWorkerClient()` → the `WorkerClient`.
- `injectWorkerModule<T>(name)` → an `AsyncMethodProxy<T>`.
- `injectWorkerSignal(fn, opts?)` → a `Signal<T>` of worker state.

## Exports

`provideCoexist`, `provideWorkerClient`, the `COEXIST_APP` / `COEXIST_WORKER_CLIENT` injection tokens, `injectCoexistApp`, `injectModule`, `injectSignal`, `injectWorkerClient`, `injectWorkerModule`, `injectWorkerSignal`, and the `InjectSignalOptions`, `AppSelector`, `ModuleSelector` types.

## License

[MIT](../../LICENSE) © Coaction
