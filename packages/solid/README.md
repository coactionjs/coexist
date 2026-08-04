# @coexist/solid

> Solid bindings for [Coexist](../../README.md): a context provider and signals for consuming a Coexist app (or a worker-hosted app).

## Installation

```sh
pnpm add @coexist/solid @coexist/core
```

Peer dependency: `solid-js` `>=1.9 <2`.

## Quick start

```tsx
import { CoexistProvider, useComputed, useModule } from "@coexist/solid";

function CounterView() {
  const counter = useModule(Counter);
  const count = useComputed(Counter, (module) => module.count);

  return <button onClick={() => counter.increase()}>{count()}</button>;
}

<CoexistProvider app={app}>
  <CounterView />
</CoexistProvider>;
```

`useComputed` returns a Solid `Accessor<T>` — call it (`count()`) to read inside JSX or an effect.

## API

| Function                        | Returns            | Description                     |
| ------------------------------- | ------------------ | ------------------------------- |
| `useApp()`                      | `App`              | The app from `CoexistProvider`. |
| `useModule(token)`              | `T`                | The bound module facade.        |
| `useComputed(fn, opts?)`        | `Accessor<T>`      | Signal for `fn(app)`.           |
| `useComputed(token, fn, opts?)` | `Accessor<TValue>` | Signal for `fn(module, app)`.   |

Both `useComputed` overloads accept `{ equals }` (defaults to `Object.is`) and clean up with `onCleanup`.

```tsx
const count = useComputed(Counter, (m) => m.count);
const version = useComputed((app) => app.state.version);
```

## Worker-hosted state

`useWorkerSelector` / `useWorkerComputed` read the client snapshot synchronously, so they throw until the host's first snapshot arrives. Await `client.ready` before mounting components that use them; `useWorkerModule` is safe at any time.

```tsx
import { WorkerClientProvider, useWorkerModule, useWorkerSelector } from "@coexist/solid";

type CounterState = { readonly counter: { readonly count: number } };

function WorkerCounterView() {
  const counter = useWorkerModule<Counter>("counter");
  const count = useWorkerSelector((state) => (state as CounterState).counter.count);

  return <button onClick={() => counter.increase()}>{count()}</button>;
}

<WorkerClientProvider client={client}>
  <WorkerCounterView />
</WorkerClientProvider>;
```

- `useWorkerClient()` → the `WorkerClient` from context.
- `useWorkerModule<T>(name)` → an `AsyncMethodProxy<T>`.
- `useWorkerSelector(fn, opts?)` / `useWorkerComputed(fn, opts?)` → `Accessor<T>`.

## Exports

`CoexistProvider`, `WorkerClientProvider`, the `CoexistContext` / `WorkerClientContext` contexts, `useApp`, `useModule`, `useComputed`, `useWorkerClient`, `useWorkerModule`, `useWorkerComputed`, `useWorkerSelector`, and the `CoexistProviderProps`, `WorkerClientProviderProps`, `UseComputedOptions`, `AppSelector`, `ModuleSelector` types. Hooks throw a `CoexistError` when the matching provider is missing.

## License

[MIT](../../LICENSE) © Coaction
