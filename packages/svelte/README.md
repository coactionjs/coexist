# @coexist/svelte

> Svelte bindings for [Coexist](../../README.md): readable stores (Svelte 4+) and rune-friendly helpers (Svelte 5.7+) for consuming a Coexist app or a worker-hosted app.

The package root exports the store-based API, which works in Svelte 4 and 5. A separate `@coexist/svelte/runes` subpath exports Svelte 5 rune helpers, so the main store contract stays unchanged for Svelte 4 users.

The runes subpath needs **Svelte 5.7.0 or newer** — it builds on `createSubscriber` from `svelte/reactivity`, which Svelte added in 5.7.0. That is higher than this package's peer range, which covers the store API the root exports; npm cannot express a per-subpath peer, so the requirement is stated here and verified by `test:frameworks:min-version`. On Svelte 5.0–5.6, importing `@coexist/svelte/runes` fails at load with `does not provide an export named 'createSubscriber'`; use the store API from the package root instead.

## Installation

```sh
pnpm add @coexist/svelte @coexist/core
```

Ships as ESM only: your project needs `"type": "module"` (or `.mjs`/`.mts`) and Node.js `>=22.12.0` or a modern bundler.

`@coexist/core` is a peer dependency: this package shares the app runtime you install, rather than bundling a second copy of it.

Peer dependency: `svelte` `^4.0.0 || ^5.0.0`. The range names the majors this adapter is tested against; a future major is not silently accepted.

## Stores (Svelte 4 and 5)

Register the app once (globally, or per component tree via context), then create readable stores and use the `$store` auto-subscription syntax.

```ts
import { moduleStore, selectedModuleStore, setCoexistApp } from "@coexist/svelte";

setCoexistApp(app); // or setCoexistContext(app) inside a component

const counter = moduleStore(Counter);
const count = selectedModuleStore(Counter, (module) => module.count);
```

```svelte
<button on:click={() => $counter.increase()}>{$count}</button>
```

| Function                                   | Returns            | Description                                |
| ------------------------------------------ | ------------------ | ------------------------------------------ |
| `setCoexistApp(app)` / `clearCoexistApp()` | `App`              | Set/clear the module-global app.           |
| `setCoexistContext(app)`                   | `App`              | Provide the app via Svelte context.        |
| `getCoexistApp()`                          | `App`              | Resolve the active app (context → global). |
| `moduleStore(token, app?)`                 | `Readable<T>`      | Store of the module facade. Emits once.    |
| `selectorStore(fn, opts?)`                 | `Readable<T>`      | Store of `fn(app)`.                        |
| `selectedModuleStore(token, fn, opts?)`    | `Readable<TValue>` | Store of `fn(module, app)`.                |

`moduleStore` holds the module facade, whose identity never changes — so the store emits once and never again. `$counter.count` therefore renders correctly on first paint and then goes stale, silently. Call actions through `$counter`; render state through `selectedModuleStore`.

Selector stores accept `{ equals, app }`; `getCoexistApp()` throws a `CoexistError` if no app was set.

## Runes (Svelte 5)

```ts
import { moduleRune, selectedModuleRune } from "@coexist/svelte/runes";

const counter = moduleRune(Counter, { app });
const count = selectedModuleRune(Counter, (module) => module.count, { app });
```

```svelte
<button onclick={() => counter.current.increase()}>{count.current}</button>
```

Runes expose `.current`, `.value`, and `.get()` (all equivalent). When `app` is omitted they fall back to `getCoexistApp()`. `selectorRune`, `moduleRune`, and `selectedModuleRune` accept `{ app, equals }`.

`moduleRune` carries the module facade the same way `moduleStore` does: its value never changes, so `counter.current.count` goes stale after first paint. Read rendered state through `selectedModuleRune`.

## Worker-hosted state

`workerSelectorStore` / `workerSelectorRune` read the client snapshot synchronously, so they throw until the host's first snapshot arrives. Await `client.ready` before creating them; `workerModuleStore` / `workerModuleRune` are safe at any time.

Stores:

```ts
import { setWorkerClient, workerModuleStore, workerSelectorStore } from "@coexist/svelte";

type CounterState = { readonly counter: { readonly count: number } };

setWorkerClient(client); // or setWorkerClientContext(client)

const counter = workerModuleStore<Counter>("counter");
const count = workerSelectorStore((state) => (state as CounterState).counter.count);
```

Runes:

```ts
import { workerModuleRune, workerSelectorRune } from "@coexist/svelte/runes";

const counter = workerModuleRune<Counter>("counter", { client });
const count = workerSelectorRune((state) => (state as CounterState).counter.count, { client });
```

- `setWorkerClient(client)` / `clearWorkerClient()` / `setWorkerClientContext(client)` register the client; `getWorkerClient()` resolves it (context → global), matching `getCoexistApp()`.
- `workerModuleStore<T>(name, client?)` / `workerModuleRune<T>(name, opts?)` → an `AsyncMethodProxy<T>`.
- `workerSelectorStore(fn, opts?)` / `workerSelectorRune(fn, opts?)` → worker state.

## Exports

Root: `setCoexistApp`, `clearCoexistApp`, `setCoexistContext`, `getCoexistApp`, `setWorkerClient`, `clearWorkerClient`, `setWorkerClientContext`, `getWorkerClient`, `moduleStore`, `selectorStore`, `selectedModuleStore`, `workerModuleStore`, `workerSelectorStore`, the `CoexistContextKey` / `WorkerClientContextKey` keys, and the `SelectorStoreOptions`, `AppSelector`, `ModuleSelector` types.

`/runes`: `moduleRune`, `selectorRune`, `selectedModuleRune`, `workerModuleRune`, `workerSelectorRune`, and the `CoexistRune`, `RuneSelectorOptions`, `ModuleRuneOptions`, `WorkerRuneSelectorOptions`, `WorkerModuleRuneOptions` types.

## License

[MIT](../../LICENSE) © Coaction
