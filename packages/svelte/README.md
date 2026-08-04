# @coexist/svelte

> Svelte bindings for [Coexist](../../README.md): readable stores (Svelte 4+) and rune-friendly helpers (Svelte 5) for consuming a Coexist app or a worker-hosted app.

The package root exports the store-based API, which works in Svelte 4 and 5. A separate `@coexist/svelte/runes` subpath exports Svelte 5 rune helpers, so the main store contract stays unchanged for Svelte 4 users.

## Installation

```sh
pnpm add @coexist/svelte @coexist/core
```

Peer dependency: `svelte` `>=4 || >=5`.

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
| `moduleStore(token, app?)`                 | `Readable<T>`      | Store of the bound module facade.          |
| `selectorStore(fn, opts?)`                 | `Readable<T>`      | Store of `fn(app)`.                        |
| `selectedModuleStore(token, fn, opts?)`    | `Readable<TValue>` | Store of `fn(module, app)`.                |

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
