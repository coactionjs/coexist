# UI Adapters

Coexist does not own rendering. There is no `ViewModule`, root component base class, or `render()` abstraction. Each UI adapter is a thin layer that:

1. provides the `App` (or a `WorkerClient`) to a component tree, and
2. exposes the bound module facade plus a reactive selector, using the framework's **native** reactivity.

This keeps every framework idiomatic: React users get hooks, Vue users get composables, Svelte users get stores/runes, Solid users get signals, Angular users get signals.

## The adapter contract

`@coexist/core` exposes a framework-neutral reactive runtime — `getModule()` and `watch()` — rather than a selector-first external-store API. Why selectors still appear in adapters:

- Coaction is **signal-backed**. Frameworks with native signal tracking (Vue, Solid, Svelte, Angular) can read module state directly inside their reactive scopes and stay subscribed automatically.
- **React** does not track external signal reads during render, so its adapter is selector-first and built on `useSyncExternalStore` for tear-free, concurrent-safe reads.

Every adapter ultimately wraps two core calls:

```ts
app.getModule(token); // the bound module facade (methods stay callable)
app.watch(read, listener, opts); // subscribe to a derived value
```

## Two things every adapter gives you

| Capability         | What it returns                                                         |
| ------------------ | ----------------------------------------------------------------------- |
| **Module access**  | The bound module facade — call its actions, read computed/state.        |
| **Selected state** | A reactive value (`fn(module \| app)`) that updates the view on change. |

Selectors accept an `{ equals }` option (default `Object.is`) to control when the view updates.

Those two capabilities are not a convention — they are a contract every adapter is tested against. `packages/integration/src/adapterConformance.ts` runs the same spec against all five: the resolved module is the facade the app owns (not a copy), a selector starts from the current value and follows later actions, two apps observed in one process stay isolated, a disposed scope stops following the app, and a missing app raises an error instead of returning `undefined`. Idioms differ; these semantics do not.

Selecting through a module token — `useSelector(Counter, (m) => m.count)` rather than `(app) => app.getModule(Counter).count` — is part of that contract, not a per-adapter convenience. An adapter that only offered the app form would push its users back to the shape adapters exist to remove.

The [worker helpers](#consuming-worker-hosted-state) are held to the same contract — mirrored state follows a remote action, a disposed scope stops mirroring, and a missing client raises an error. They are the half most likely to drift: used less often, mirroring state rather than owning it, and backed by a runtime that is still beta.

## React — [`@coexist/react`](../packages/react/README.md)

```tsx
import { CoexistProvider, useModule, useSelector } from "@coexist/react";

function CounterView() {
  const counter = useModule(Counter);
  const count = useSelector(Counter, (m) => m.count);
  return <button onClick={() => counter.increase()}>{count}</button>;
}

<CoexistProvider app={app}>
  <CounterView />
</CoexistProvider>;
```

`useApp()` / `useCoexist()`, `useModule(token)`, `useSelector(selector)` or `useSelector(token, fn)`.

## Vue — [`@coexist/vue`](../packages/vue/README.md)

```ts
import { coexistPlugin, useComputed, useModule } from "@coexist/vue";

const counter = useModule(Counter);
const count = useComputed(Counter, (m) => m.count); // Readonly<Ref<T>>

createVueApp(Root).use(coexistPlugin(app)).mount("#app");
```

`provideCoexist(app)` / `coexistPlugin(app)`, `useModule(token)`, `useSelector`/`useComputed` (return `Readonly<Ref<T>>`).

## Svelte — [`@coexist/svelte`](../packages/svelte/README.md)

```ts
import { moduleStore, selectedModuleStore, setCoexistApp } from "@coexist/svelte";

setCoexistApp(app);
const counter = moduleStore(Counter);
const count = selectedModuleStore(Counter, (m) => m.count);
```

```svelte
<button on:click={() => $counter.increase()}>{$count}</button>
```

Stores work in Svelte 4 and 5. Svelte 5 rune helpers live at `@coexist/svelte/runes` (`moduleRune`, `selectedModuleRune`) and expose `.current` / `.value` / `.get()`.

## Solid — [`@coexist/solid`](../packages/solid/README.md)

```tsx
import { CoexistProvider, useComputed, useModule } from "@coexist/solid";

function CounterView() {
  const counter = useModule(Counter);
  const count = useComputed(Counter, (m) => m.count); // Accessor<T>
  return <button onClick={() => counter.increase()}>{count()}</button>;
}
```

`useComputed` returns a Solid `Accessor<T>` — call it (`count()`).

## Angular — [`@coexist/angular`](../packages/angular/README.md)

```ts
import { Component } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { injectModule, injectSignal, provideCoexist } from "@coexist/angular";

@Component({
  template: `<button (click)="counter.increase()">{{ count() }}</button>`,
})
class CounterView {
  readonly counter = injectModule(Counter);
  readonly count = injectSignal(Counter, (m) => m.count); // Signal<T>
}

bootstrapApplication(CounterView, { providers: [provideCoexist(app)] });
```

## At a glance

| Framework      | Provide the app                       | Module access  | Selected state                | Returns                     |
| -------------- | ------------------------------------- | -------------- | ----------------------------- | --------------------------- |
| React          | `<CoexistProvider app>`               | `useModule`    | `useSelector`                 | raw value                   |
| Vue            | `coexistPlugin` / `provideCoexist`    | `useModule`    | `useSelector` / `useComputed` | `Readonly<Ref<T>>`          |
| Svelte         | `setCoexistApp` / `setCoexistContext` | `moduleStore`  | `selectedModuleStore`         | `Readable<T>`               |
| Svelte 5 runes | (same)                                | `moduleRune`   | `selectedModuleRune`          | `{ current, value, get() }` |
| Solid          | `<CoexistProvider app>`               | `useModule`    | `useComputed`                 | `Accessor<T>`               |
| Angular        | `provideCoexist`                      | `injectModule` | `injectSignal`                | `Signal<T>`                 |

## Consuming worker-hosted state

Every adapter has a parallel set of helpers for state hosted in a Worker (or other transport), driven by a `WorkerClient` instead of an `App`:

| Framework | Provide the client                           | Module proxy                             | Selected state                               |
| --------- | -------------------------------------------- | ---------------------------------------- | -------------------------------------------- |
| React     | `<WorkerClientProvider client>`              | `useWorkerModule`                        | `useWorkerSelector`                          |
| Vue       | `workerClientPlugin` / `provideWorkerClient` | `useWorkerModule`                        | `useWorkerSelector` / `useWorkerComputed`    |
| Svelte    | `setWorkerClient` / `setWorkerClientContext` | `workerModuleStore` / `workerModuleRune` | `workerSelectorStore` / `workerSelectorRune` |
| Solid     | `<WorkerClientProvider client>`              | `useWorkerModule`                        | `useWorkerSelector` / `useWorkerComputed`    |
| Angular   | `provideWorkerClient`                        | `injectWorkerModule`                     | `injectWorkerSignal`                         |

The module proxy returned by `useWorkerModule`/`injectWorkerModule`/etc. is an `AsyncMethodProxy<T>` — every method returns a `Promise` because the call crosses a thread/transport boundary. See [Worker & Shared Runtime](./worker-runtime.md).

### Await `client.ready` before rendering worker selectors

The worker **selector** helpers read the client's snapshot synchronously, and a `WorkerClient` has no state until the host's first snapshot arrives. `useWorkerSelector`, `useWorkerComputed`, `injectWorkerSignal`, `workerSelectorStore`, and `workerSelectorRune` therefore throw `CoexistError: Worker client state is not ready.` when they run first — in React that surfaces as an error thrown during render.

Await `client.ready` before mounting anything that selects worker state:

```ts
const client = createWorkerClient({ transport: createPostMessageWorkerTransport(worker) });

await client.ready; // resolves once the initial snapshot arrives

createRoot(document.getElementById("root")!).render(
  <WorkerClientProvider client={client}>
    <WorkerCounterView />
  </WorkerClientProvider>,
);
```

If the tree must mount first, render a loading state until `client.ready` settles, and only then render the components that call a worker selector. The module proxy helpers (`useWorkerModule` and friends) have no such constraint — they only queue RPC calls, so they are safe before readiness.

## Using two frameworks at once

Because the core never imports a UI framework, the _same_ `app` can be rendered by more than one adapter in the same page — useful for incremental migrations and micro-frontends. Mount each framework normally and pass it the shared `app`.

## Next

- [Worker & Shared Runtime](./worker-runtime.md) — the `WorkerClient` model.
- [State & Reactivity](./state-and-reactivity.md) — what selectors subscribe to.
- Per-framework API: [React](../packages/react/README.md) · [Vue](../packages/vue/README.md) · [Svelte](../packages/svelte/README.md) · [Solid](../packages/solid/README.md) · [Angular](../packages/angular/README.md).
