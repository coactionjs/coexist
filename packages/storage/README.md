# @coexist/storage

> Cross-framework persistence plugin for [Coexist](../../README.md), powered by [`localspace`](https://www.npmjs.com/package/localspace): hydrate app state on startup, persist state changes, and expose a shared storage service through app DI.

The recommended `createLocalSpaceStoragePlugin()` uses localspace 3 drivers and plugins: IndexedDB, localStorage, memory fallback, TTL, encryption, and compression. The older `createStoragePlugin()` adapter is still available for simple `getItem` / `setItem` backends.

## Installation

```sh
pnpm add @coexist/storage @coexist/core
```

Ships as ESM only: your project needs `"type": "module"` (or `.mjs`/`.mts`) and Node.js `>=22.12.0` or a modern bundler.

`@coexist/core` is a peer dependency: this package shares the app runtime you install, rather than bundling a second copy of it.

## Quick start

```ts
import { createApp } from "@coexist/core";
import { StorageToken, createLocalSpaceStoragePlugin, ttlPlugin } from "@coexist/storage";

type CounterAppState = {
  readonly counter: {
    readonly count: number;
  };
};

const storage = createLocalSpaceStoragePlugin<CounterAppState>({
  key: "coexist:app",
  options: {
    name: "my-app",
    storeName: "state",
    plugins: [ttlPlugin({ defaultTTL: 7 * 24 * 60 * 60_000 })],
  },
  partialize: (state) => ({ counter: (state as CounterAppState).counter }),
  merge: (persisted, current) => ({ ...(current as object), ...persisted }),
});

const app = createApp({
  plugins: [storage],
  providers: [Counter],
});

await app.start(); // waits for hydration to complete
await storage.flush(); // waits for queued writes (useful in tests/tools)

const kv = app.get(StorageToken);
await kv.set("draft", { title: "Hello" });
```

## Localspace Options

`createLocalSpaceStoragePlugin()` accepts:

| Option             | Type                                   | Default            | Description                                                          |
| ------------------ | -------------------------------------- | ------------------ | -------------------------------------------------------------------- |
| `key`              | `string`                               | `coexist:state`    | localspace key used for Coexist app state.                           |
| `options`          | `LocalSpaceOptions`                    | localspace default | localspace instance config (`name`, `storeName`, `driver`, plugins). |
| `instance`         | `LocalSpaceInstance`                   | —                  | Existing localspace instance to wrap.                                |
| `service`          | `StorageService`                       | —                  | Existing Coexist storage service to provide.                         |
| `hydrate`          | `boolean`                              | `true`             | Hydrate app state from `key` during plugin setup.                    |
| `persist`          | `boolean`                              | `true`             | Persist app state on store changes.                                  |
| `throttleMs`       | `number`                               | `0`                | Trailing throttle for app-state persistence writes.                  |
| `destroyOnDispose` | `boolean`                              | owns instance      | Close localspace resources when the app is disposed.                 |
| `partialize`       | `(state) => TState`                    | identity           | Pick the subset of app state to persist.                             |
| `merge`            | `(persisted, current) => state`        | use persisted      | Combine persisted state with current defaults on hydrate.            |
| `shouldPersist`    | `(event: StateChangeEvent) => boolean` | always             | Skip selected state changes.                                         |
| `onError`          | `(error, phase) => void`               | —                  | Observe `"hydrate"`, `"persist"`, or `"clear"` failures.             |

`LocalSpaceOptions`, `LocalSpaceInstance`, `LocalSpaceConfig`, `LocalSpacePlugin`, and `StorageValueInput` in these signatures are localspace's types, and this package does not re-export them — a re-exported type would be part of _this_ package's API, so localspace changing one would break here. Inference covers the common case (`options: { … }` is checked against `LocalSpaceOptions` without naming it); import the name from `localspace` when you need to write it down:

```ts
import type { LocalSpaceOptions, LocalSpacePlugin } from "localspace";
```

The drivers and plugins themselves are still re-exported from `@coexist/storage`, so configuring a store needs no second install — only naming their types does.

`StorageToken` resolves a `StorageService` in every UI framework integration:

```ts
const storage = app.get(StorageToken);

await storage.set("theme", "dark");
const theme = await storage.get<string>("theme");
await storage.setMany([
  { key: "cache:user", value: { name: "Ada" } },
  { key: "cache:org", value: { name: "Coexist" } },
]);
```

`StorageService.instance` exposes the underlying localspace instance when you need lower-level APIs. It is a raw escape hatch to the library underneath, so what it offers is localspace's contract, not this package's — and it reaches past the plugin's ownership model, so prefer `destroyOnDispose` over closing the instance yourself.

`destroyOnDispose` is the sole ownership switch for the supplied storage service. It defaults to `true` only when the plugin created the service itself; an external `service` or `instance` is retained by default. Setting it explicitly to `true` closes that resource exactly once during app disposal through the service's `close()`, which releases plugins and the driver and keeps stored data.

Persisted values must be plain data, because localspace 3 validates every write: objects, arrays, strings, numbers, booleans, `null`, and binary buffers. `StorageService.set()` checks that at compile time through localspace's `StorageValueInput`; app state is checked when it is written, and a value localspace rejects — a `Date`, `Map`, `Set`, or class instance — is reported to `onError` in the `"persist"` phase. Convert such values in `partialize`.

## Migrating from 1.x

`@coexist/storage` 2.0 runs on localspace 3. Read localspace's [migration guide](https://github.com/unadlib/localspace/blob/v3.0.1/docs/migration-guide.md) for driver, plugin, transaction, and encryption changes; the changes on this package's surface are:

| 1.x                                    | 2.0                                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `syncPlugin`                           | Removed. Notify other tabs from application code, for example over a `BroadcastChannel`.                                                   |
| `quotaPlugin`                          | Removed. Enforce an application size policy in your own code before writing.                                                               |
| `StorageService.destroy()`             | `StorageService.close()`, which releases resources and keeps stored data.                                                                  |
| `StorageService.getPerformanceStats()` | Removed; localspace no longer collects performance stats.                                                                                  |
| Any value in `set()` / `setMany()`     | Plain data only, checked by type and at runtime.                                                                                           |
| `transaction()` on any driver          | IndexedDB and memory only; localStorage rejects with `UNSUPPORTED_OPERATION`, and an overlapping transaction on the same instance rejects. |
| `StorageTransactionScope.iterate()`    | Awaits async callbacks and resolves to `U \| undefined`.                                                                                   |

A custom `StorageService` must implement `close()` instead of `destroy()` and `getPerformanceStats()`.

### Encrypted stores

`encryptionPlugin()` now rejects a stored value that is not an encrypted payload, with `DESERIALIZATION_FAILED` (`details.reason: "unencrypted-value"`), because anyone with storage access could have written it. If your app persisted state before it enabled encryption, hydration fails on that value and `app.start()` rejects. Rewrite the value once before switching to the strict store:

```ts
import { createLocalSpaceStorage, encryptionPlugin } from "@coexist/storage";
import type { StorageValue } from "localspace";

const options = { name: "my-app", storeName: "state" };
const migration = createLocalSpaceStorage({
  options: { ...options, plugins: [encryptionPlugin({ key, allowPlaintext: true })] },
});
const state = await migration.get<StorageValue>("coexist:app");
await migration.close();

const strict = createLocalSpaceStorage({
  options: { ...options, plugins: [encryptionPlugin({ key })] },
});
if (state !== null) await strict.set("coexist:app", state);
await strict.close();
```

Here `key` is your encryption key, and `"coexist:app"` is the `key` option you pass to `createLocalSpaceStoragePlugin()` (`"coexist:state"` by default). `encryptionPlugin()` also accepts AES-GCM only: AES-CBC or AES-CTR configuration fails with `INVALID_CONFIG`. Read such data with `legacyEncryptionMigrationPlugin` from `localspace` and write it into an AES-GCM store, as localspace's migration guide describes.

## Legacy StorageLike Adapter

`createStoragePlugin()` is retained for custom string-only backends:

| Option          | Type                                   | Default          | Description                                                |
| --------------- | -------------------------------------- | ---------------- | ---------------------------------------------------------- |
| `key`           | `string`                               | —                | Storage key (required).                                    |
| `storage`       | `StorageLike`                          | —                | The backend (required). May be sync or async.              |
| `serialize`     | `(state) => string`                    | `JSON.stringify` | Encode state before writing.                               |
| `deserialize`   | `(value) => TState`                    | `JSON.parse`     | Decode persisted text on hydrate.                          |
| `partialize`    | `(state) => TState`                    | identity         | Pick the subset of state to persist.                       |
| `merge`         | `(persisted, current) => state`        | use persisted    | Combine persisted state with the current state on hydrate. |
| `throttleMs`    | `number`                               | `0`              | Trailing throttle for persistence writes.                  |
| `shouldPersist` | `(event: StateChangeEvent) => boolean` | always           | Skip persisting selected state changes.                    |
| `onError`       | `(error, phase) => void`               | —                | Observe `"hydrate"`, `"persist"`, or `"clear"` failures.   |

## Plugin methods

The returned plugin adds imperative controls on top of the `Plugin` interface:

```ts
await storage.ready(); // resolves when hydration finished (or failed)
await storage.flush(); // resolves when all queued writes settle
await storage.persist(app); // force-write the current full state
await storage.clear(); // remove the persisted entry
```

`ready()` describes the hydration of the app the plugin is installed in, so it stays pending until that app runs the plugin's setup — awaiting it right after `createApp()` is safe. It rejects if hydration fails, and also if the app tears down without ever reaching this plugin's setup. Awaiting `ready()` on a plugin that was never passed to an app therefore never resolves: there is no hydration to wait for. The imperative write methods (`flush`, `persist`, `clear`) stay usable standalone.

`app.dispose()` also waits for pending storage writes through the plugin context, so production teardown does not need an extra `flush()` call. Hydration is committed through an app action boundary, so both storage adapters remain compatible with `devOptions.strictActions: true`.

For the localspace plugin, `storage.clear()` removes the persisted app-state key. Use `app.get(StorageToken).clear()` when you want to clear the whole localspace store.

`StorageLike`:

```ts
interface StorageLike {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem?(key: string): void | Promise<void>;
}
```

## Exports

`createLocalSpaceStoragePlugin`, `createLocalSpaceStorage`, `StorageToken`, `createStoragePlugin`, the localspace plugin/driver value re-exports (`compressionPlugin`, `encryptionPlugin`, `indexedDBDriver`, `localStorageDriver`, `memoryDriver`, `ttlPlugin`), and the `StorageService`, `StoragePlugin`, `StoragePluginOptions`, `StorageLike`, `StoragePluginErrorPhase`, `StorageEntry`, `StorageEntries`, `StorageBatchResponse`, `StorageTransactionMode`, `StorageTransactionScope`, `CreateLocalSpaceStorageOptions`, `LocalSpaceStoragePlugin`, `LocalSpaceStoragePluginOptions` types.

No localspace **type** is re-exported: they appear in the signatures above as the external names they are, and are imported from `localspace` directly.

## License

[MIT](../../LICENSE) © Coaction
