# @coexist/react

> React bindings for [Coexist](../../README.md): context provider and hooks for consuming a Coexist app (or a worker-hosted app) with native React reactivity.

This adapter does not own rendering or define a view base class. It exposes a `CoexistProvider`, a `WorkerClientProvider`, and a small set of hooks built on `useSyncExternalStore`, so selectors stay tear-free and concurrent-safe.

## Installation

```sh
pnpm add @coexist/react @coexist/core
```

Ships as ESM only: your project needs `"type": "module"` (or `.mjs`/`.mts`) and Node.js `>=22.12.0` or a modern bundler.

Peer dependency: `react` `^18.3.0 || ^19.0.0`. The range names the majors this adapter is tested against; a future major is not silently accepted.

## Quick start

```tsx
import { createRoot } from "react-dom/client";
import { createApp, defineModule } from "@coexist/core";
import { CoexistProvider, useModule, useSelector } from "@coexist/react";

class Counter {
  count = 0;
  get double(): number {
    return this.count * 2;
  }
  increase(step = 1): void {
    this.count += step;
  }
}

defineModule(Counter, {
  actions: ["increase"],
  computed: ["double"],
  name: "counter",
  state: ["count"],
});

const app = createApp({ providers: [Counter] });

function CounterView() {
  const counter = useModule(Counter);
  const count = useSelector(Counter, (module) => module.count);
  const double = useSelector(Counter, (module) => module.double);

  return (
    <button onClick={() => counter.increase()}>
      {count} (×2 = {double})
    </button>
  );
}

createRoot(document.getElementById("root")!).render(
  <CoexistProvider app={app}>
    <CounterView />
  </CoexistProvider>,
);
```

## Hooks

| Hook                        | Returns  | Description                                     |
| --------------------------- | -------- | ----------------------------------------------- |
| `useApp()` / `useCoexist()` | `App`    | The app from the nearest provider.              |
| `useModule(token)`          | `T`      | The bound module facade. Methods stay callable. |
| `useSelector(selector)`     | `T`      | Subscribe to `selector(app)`.                   |
| `useSelector(token, fn)`    | `TValue` | Subscribe to `fn(module, app)` for a module.    |

`useSelector` accepts a `{ equals }` option (defaults to `Object.is`) to control re-renders.

```tsx
const count = useSelector(Counter, (m) => m.count);
const version = useSelector((app) => app.state.version);
const items = useSelector(Todos, (m) => m.items, {
  equals: (a, b) => a.length === b.length,
});
```

## Worker-hosted state

Wrap the tree in `WorkerClientProvider` and use the worker hooks to consume an app running in a Worker, iframe, or other [transport](../core/README.md#worker--shared-runtime).

`useWorkerSelector` reads the client snapshot synchronously, so it throws during render until the host's first snapshot arrives. Await `client.ready` before mounting components that use it; `useWorkerModule` is safe at any time.

```tsx
import { WorkerClientProvider, useWorkerModule, useWorkerSelector } from "@coexist/react";

type CounterState = { readonly counter: { readonly count: number } };

function WorkerCounterView() {
  const counter = useWorkerModule<Counter>("counter"); // async method proxy
  const count = useWorkerSelector((state) => (state as CounterState).counter.count);

  return <button onClick={() => counter.increase()}>{count}</button>;
}

<WorkerClientProvider client={client}>
  <WorkerCounterView />
</WorkerClientProvider>;
```

- `useWorkerClient()` → the `WorkerClient` from context.
- `useWorkerModule<T>(name)` → an `AsyncMethodProxy<T>` (every method returns a `Promise`).
- `useWorkerSelector(selector, { equals? })` → selected worker state.

## Exports

Providers `CoexistProvider`, `WorkerClientProvider`; contexts `CoexistContext`, `WorkerClientContext`; hooks `useApp`, `useCoexist`, `useModule`, `useSelector`, `useWorkerClient`, `useWorkerModule`, `useWorkerSelector`; and the `CoexistProviderProps`, `WorkerClientProviderProps`, `UseSelectorOptions`, `AppSelector`, `ModuleSelector` types. Missing-provider hooks throw a `CoexistError`.

## License

[MIT](../../LICENSE) © Coaction
