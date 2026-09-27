# State & Reactivity

Coexist's reactivity is provided by [Coaction](https://www.npmjs.com/package/coaction). You rarely call Coaction directly — modules and adapters sit on top — but understanding the store helps when you reach for `watch`, strict actions, or patches.

## One store, many slices

Every stateful module contributes a **slice** to a single app-level Coaction store, keyed by the module's `name`:

```ts
const app = createApp({ providers: [Counter, Todos] });

app.store.getPureState();
// { counter: { count: 0 }, todos: { items: [] } }
```

One store (not one per module) is a deliberate choice: app-level patches, persistence, devtools, and selectors all operate over the whole application at once. User modules stay plain classes; Coexist generates the Coaction-compatible state/action layer internally.

## Accessing state

Three layers, from most to least common:

1. **Through the module facade** — normal property access:

   ```ts
   app.getModule(Counter).count;
   ```

2. **Through a UI adapter selector** — reactive in components (see [UI Adapters](./ui-adapters.md)):

   ```ts
   const count = useSelector(Counter, (m) => m.count); // React
   ```

3. **Through the store** — for advanced/tooling cases:

   ```ts
   app.store.getPureState(); // full plain snapshot
   app.store.setState(next); // imperative write (used by plugins)
   app.store.subscribe(() => {}); // low-level change subscription
   ```

Adapters use the stable reactive runtime contract, not private store internals. Prefer `app.getModule()` and selectors in application code; reserve `app.store` for plugins and tooling.

`app.store` is an `AppStore` — five members with signatures owned by Coexist:

```ts
interface AppStore {
  getPureState(): AppRootState; // plain snapshot of the whole tree
  getState(): AppRootState; // reactive read, tracked inside a reactive scope
  setState(update: AppStoreUpdate): void; // write through the runtime's transaction machinery
  apply(state?: AppRootState, patches?: readonly AppStorePatch[]): void;
  subscribe(listener): () => void; // committed-change notification
}
```

`AppStoreUpdate` accepts a partial root state, a draft callback, or `null`. `AppStorePatch` has an `add`, `remove`, or `replace` operation, a string or array path, and an optional value. These types are exported from `@coexist/core`; the low-level `setState` updater hook remains available in the full type declaration.

Store lifetime belongs to the app: there is no `destroy()` on this surface, because disposing the store is `app.dispose()`'s job.

With patches, omit `state` or pass the current `app.store.getPureState()` result. [Coaction 4](https://github.com/coactionjs/coaction/blob/v4.0.0/docs/migration/v4.md) rejects a stale or unrelated patch base. In strict action mode, Coexist accepts the current frozen snapshot returned by `getPureState()` and checks it against the live state before applying patches. A plain `apply(nextState)` still replaces state. Patch observers can receive a root replacement (`path: []`) when Coaction needs one to preserve an object graph; consumers should replay the published pair rather than assume every patch addresses one leaf. `engine.transport` still selects Coaction's shared runtime internally. The separate [Coexist worker runtime](./worker-runtime.md) remains the recommended application-level API.

## Watching state

`app.watch(read, listener, options?)` subscribes to a derived value. The `listener` fires when the value changes (by `equals`, default `Object.is`):

```ts
const stop = app.watch(
  () => app.getModule(Counter).count,
  (value, previous) => console.log(`count: ${previous} → ${value}`),
  {
    equals: Object.is, // custom equality to control firing
    immediate: false, // call the listener once up front when true
  },
);

stop(); // unsubscribe
```

Each committed store mutation is one notification source. A selector that returns a fresh object is therefore evaluated and delivered at most once for that mutation (subject to `equals`). Listener exceptions and rejected listener promises are observer failures: they are reported to plugin `onError` hooks with phase `"watch"` and never turn an already-committed action into a failure.

`watch` is the primitive every UI adapter builds on — React's `useSelector`, Vue's `useSelector`, Svelte's `selectorStore`, Solid's `useComputed`, and Angular's `injectSignal` all wrap it with the framework's native reactivity.

## Invalidation granularity

The app publishes one committed state transition to `subscribe`, `watch`, plugins, UI adapters, and module effects by default. Selectors run on each commit and use equality to decide whether to notify. Coaction 4's path tracking is available for effects as an opt-in:

- A **computed** getter is memoized between commits. Repeated reads with no committed change in between evaluate it once. Any committed change anywhere in the app invalidates the cache, so the next read re-evaluates even if the state the getter read is unchanged.
- An **effect** runs after initialization, then re-runs after every committed change by default. This preserves the `1.0` behavior, including effects that read no reactive state.
- With `engine: { effectInvalidation: "path" }`, an effect re-runs when a state path it read on its last run changes. An unrelated write does not re-run it. An effect that reads no reactive state only runs initially.

Two things keep this cheap in practice:

- **Actions batch.** An action's synchronous writes commit once, so an effect re-runs once for that action.
- **Unchanged writes do not commit.** Assigning the value a field already holds produces no commit and therefore no invalidation.

When you need value-level granularity, put the equality check where it is observable — `watch(read, listener, { equals })` and every UI adapter selector only notify when the selected value actually changes:

```ts
// Re-runs on every app commit by default; with path tracking, when this.rows changes.
class Report {
  expensive(): void {
    buildReport(this.rows);
  }
}

// Only fires when `rows` itself changes.
app.watch(
  () => app.getModule(Report).rows,
  (rows) => buildReport(rows),
);
```

Keep default effects cheap. With path tracking, read their dependencies during each run. Use `watch(read, listener, { equals })` when you want a selected value comparison after every app commit.

### What that costs

`pnpm run bench` measures the public selector fanout. In a local run on 2026-09-27 with Node 24.16.0 on an Apple M1 Max, one module changed while the other selectors read unrelated values:

| Selectors watching the app | Cost of one action |
| -------------------------- | ------------------ |
| 100                        | ~0.03 ms           |
| 1,000                      | ~0.16 ms           |
| 10,000                     | ~1.95 ms           |

Cost tracks the number of public selectors, not the size of the change: every selector is given the chance to re-run, and `equals` then suppresses the UI update rather than the selector call. Measure on your target device if you approach thousands of selectors. In the same run, app creation took ~19 ms for 1,000 modules and ~960 ms for 10,000; one action took ~0.08 ms and ~1.28 ms respectively.

The benchmark also contrasts worker sync modes on the same state: a 1,000-item snapshot is ~30 KB, while the patch for renaming one item is under 100 bytes. Prefer `sync: "patch"` for anything but small state.

<a id="why-it-is-one-signal-and-what-it-would-take-to-change-it"></a>

### Why app watches use one publication, and what it would take to change it

Publishing each committed transition to all app watches and adapters buys three properties the rest of the design leans on:

- **Cross-module actions commit atomically.** An action touching three modules produces one notification, so no observer ever sees a half-applied change. Per-module signals would need an explicit transaction spanning them to keep that.
- **Adapters stay uniform.** Every adapter subscribes to one thing. A finer model means adapters must decide _which_ signals a selector depends on, which for React (no tracking during render) means a dependency-collection pass the other four would not need.
- **Plugins see the whole app.** Persistence, devtools, and worker publication all operate on the complete tree; `onStateChange` and `onPatch` have one coherent meaning.

**This was decided before `1.0`, and the decision was to keep it.** Sending each app commit to all public watches and adapters is the behaviour `1.0` promises. These were the alternatives weighed:

| Option                                  | What it buys                                 | What it costs                                                                                                                   |
| --------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Keep one app publication** — _chosen_ | Today's atomicity and uniformity             | Selector cost scales with selector count                                                                                        |
| Per-module publication token            | Only observers of a changed module re-run    | Cross-module atomicity needs an explicit multi-token transaction; adapters must map a selector to its tokens                    |
| Selector dependency tracking            | Precise invalidation without user annotation | Every selector runs inside a tracking scope; React's render-time reads are not trackable, so its adapter needs a different path |
| Opt-in fine mode per app                | Existing apps unchanged, large apps opt in   | Two invalidation models to maintain and test, and plugins must work under both                                                  |

The measured selector cost and the three properties above — atomic cross-module commits, uniform adapters, whole-app plugins — carried the decision. Optional effect path tracking is separate from this public `watch` and adapter publication model.

What would reopen it is evidence, not preference: an app past roughly ten thousand live selectors where `pnpm run bench` shows per-action cost becoming visible in a frame budget. Because the current behaviour is now a compatibility promise, moving to any of the other rows is a major-version change — with one exception. Adding an **opt-in** fine mode is additive, so it could land in a minor: apps that never enable it keep exactly today's semantics. That is the path a future change would most likely take, and the reason the row is kept here rather than deleted.

Re-run `pnpm run bench` before arguing either way.

## Actions and transactions

A method declared as an action wraps its synchronous state writes in a single transaction: multiple writes produce one patch and one notification.

```ts
class Cart {
  items: Item[] = [];
  total = 0;

  addItem(item: Item): void {
    this.items.push(item);
    this.total += item.price; // one transaction, one update
  }
}
```

Each action also emits an `ActionEvent` (`{ module, method, args, startedAt, endedAt?, error? }`) to plugins — that's how the logger and devtools see them.

## Strict actions and `runInAction`

By default, writing state outside an action is allowed. Enable **strict actions** to require that every state write happens inside an action boundary — a guardrail that keeps all mutations auditable:

```ts
const app = createApp({
  providers: [Counter],
  devOptions: { strictActions: true },
});
```

With strict actions on, top-level assignments, nested object/array mutations, and direct `app.store.setState()` / `app.store.apply()` calls outside an action throw before state changes. State views returned through modules and `store.getState()` carry the same deep guard. `store.getPureState()` returns a detached, serializable snapshot whose plain object and array tree is recursively frozen, so mutating the raw snapshot cannot bypass the action boundary.

Async actions need care. Synchronous writes **before the first `await`** are part of the action's transaction. Writes **after an `await`** are no longer inside the original boundary, so in strict mode they need a fresh one. Use `runInAction`:

```ts
import { runInAction } from "@coexist/core";

class Counter {
  @State accessor count = 0;

  @Action async refresh(): Promise<void> {
    this.count = -1; // in the transaction (pre-await)
    const next = await loadCount();

    runInAction(this, () => {
      this.count = next; // post-await: needs its own boundary
    });
  }
}
```

`runInAction` accepts the module instance (or a token/instance) plus a callback, and an optional `{ name, args }` for nicer action events:

```ts
app.runInAction(
  Counter,
  () => {
    app.getModule(Counter).count = 0;
  },
  { name: "reset" },
);
```

For a controlled whole-store update, omit the module target and mutate through a store API inside the boundary. These action events use `"$app"` as their module:

```ts
app.runInAction(() => app.store.setState(nextState), { name: "hydrate" });
```

The writable draft authority exists only while the synchronous store updater is running. Retaining a nested reference or continuing after an `await` does not extend the boundary.

Async actions may return promises; their settlement is reported to plugins.

## Patches

Enable patch generation to receive structured diffs of each change. A plugin with `onPatch` enables patches automatically unless `engine.patches` is explicitly set:

```ts
const app = createApp({ providers: [Counter], engine: { patches: true } });
```

With patches on, plugins receive `PatchEvent` (`{ patches, inversePatches }`) via `onPatch`. Patches power:

- **The worker runtime's `sync: "patch"` mode** — sending diffs instead of full snapshots after startup (see [Worker & Shared Runtime](./worker-runtime.md)).
- **Devtools** time-travel-style inspection (see [Plugins](./plugins.md)).

The store also tracks a monotonic `app.state.version` that increments on every change — handy as a coarse "something changed" signal.

## State change events

Independently of patches, every store change emits a `StateChangeEvent` (`{ state }`) to plugins via `onStateChange`. The [storage plugin](../packages/storage/README.md) uses this to persist state; the [devtools plugin](../packages/devtools/README.md) records it on the timeline.

## Next

- [Plugins](./plugins.md) — observe actions, patches, and state changes.
- [Worker & Shared Runtime](./worker-runtime.md) — sync state across threads/tabs.
- [Testing](./testing.md) — assert on recorded actions, state, and patches.
