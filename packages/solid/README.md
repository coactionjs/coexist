# @coexist/solid

> Solid bindings for [CoSystem](../../README.md): a context provider and signals
> for consuming a CoSystem app (or a worker-hosted app).

## Installation

```sh
pnpm add @coexist/solid @coexist/core
```

Peer dependency: `solid-js` `>=1.9 <2`.

## Quick start

```tsx
import { CoSystemProvider, useComputed, useModule } from "@coexist/solid";

function CounterView() {
  const counter = useModule(Counter);
  const count = useComputed(Counter, (module) => module.count);

  return <button onClick={() => counter.increase()}>{count()}</button>;
}

<CoSystemProvider app={app}>
  <CounterView />
</CoSystemProvider>;
```

`useComputed` returns a Solid `Accessor<T>` — call it (`count()`) to read inside
JSX or an effect.

## API

| Function                        | Returns            | Description                      |
| ------------------------------- | ------------------ | -------------------------------- |
| `useApp()`                      | `App`              | The app from `CoSystemProvider`. |
| `useModule(token)`              | `T`                | The bound module facade.         |
| `useComputed(fn, opts?)`        | `Accessor<T>`      | Signal for `fn(app)`.            |
| `useComputed(token, fn, opts?)` | `Accessor<TValue>` | Signal for `fn(module, app)`.    |

Both `useComputed` overloads accept `{ equals }` (defaults to `Object.is`) and
clean up with `onCleanup`.

```tsx
const count = useComputed(Counter, (m) => m.count);
const version = useComputed((app) => app.state.version);
```

## Worker-hosted state

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

`CoSystemProvider`, `WorkerClientProvider`, the `CoSystemContext` /
`WorkerClientContext` contexts, `useApp`, `useModule`, `useComputed`,
`useWorkerClient`, `useWorkerModule`, `useWorkerComputed`, `useWorkerSelector`,
and the `CoSystemProviderProps`, `WorkerClientProviderProps`,
`UseComputedOptions`, `AppSelector`, `ModuleSelector` types. Hooks throw a
`CosystemError` when the matching provider is missing.

## License

[MIT](../../LICENSE) © Coaction
