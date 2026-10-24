# Worker & Shared Runtime

`@coexist/core` includes a worker runtime: run an app (and its modules) in a Web Worker, iframe, `MessagePort`, `BroadcastChannel`, or custom RPC channel, and consume its state from another context with the same selector and module ergonomics you use on the main thread.

> **Stability.** The worker API is **Stable** under the `2.x` promise over trusted, reliable transports. The supported model is one authoritative host with clients, host-authoritative last-writer-wins, application-owned bootstrapping, and an internal wire protocol. See [Scope & Stability](./scope-and-stability.md#the-worker-runtime) for the boundaries.

Because business logic is plain modules, **moving it off-thread does not change the modules** — only where they run.

## The host/client model

```txt
Host (e.g. Worker thread)                 Client (e.g. UI thread)
┌───────────────────────────┐  transport  ┌───────────────────────────┐
│ createWorkerApp({          │ ──────────► │ createWorkerClient({      │
│   providers, sync, ...     │ ◄────────── │   transport, onConflict   │
│ })                         │  messages   │ })                        │
│  runs real Coexist app    │             │  state mirror + RPC proxy │
└───────────────────────────┘             └───────────────────────────┘
```

- The **host** runs an actual Coexist app and publishes state over a transport.
- The **client** mirrors that state, exposes selectors, and delegates module method calls back to the host as RPC.

```ts
import {
  createMemoryWorkerTransportPair,
  createWorkerApp,
  createWorkerClient,
} from "@coexist/core";

const [hostTransport, clientTransport] = createMemoryWorkerTransportPair();

const client = createWorkerClient({ transport: clientTransport });
const host = createWorkerApp({
  providers: [Counter],
  sync: "patch",
  transport: hostTransport,
});

await client.ready; // resolves once the initial snapshot arrives
await client.module<Counter>("counter").increase(1);

const selectCount = (state: unknown) => (state as { counter: { count: number } }).counter.count;
const count = client.select(selectCount);
const unsubscribe = client.watch(selectCount, (value) => console.log(value));

unsubscribe();
client.dispose();
await host.dispose();
```

## The `WorkerClient` API

```ts
interface WorkerClient {
  readonly ready: Promise<void>; // resolves after the first snapshot
  readonly state: {
    readonly version: number;
    readonly status: WorkerSyncStatus;
  };
  getState(): unknown;
  select<T>(selector): T; // read derived state synchronously
  watch<T>(selector, listener, opts?): () => void; // subscribe (equals/immediate)
  call(module, method, ...args): Promise<unknown>;
  callWithOptions(module, method, args, { timeout, signal }): Promise<unknown>;
  module<T>(name): AsyncMethodProxy<T>; // typed async method proxy
  subscribe(listener): () => void; // low-level state-message subscription
  dispose(): void;
}
```

`module<T>(name)` returns an `AsyncMethodProxy<T>`: every method becomes `(...args) => Promise<...>`, since each call is delegated across the transport. When a delegated method settles, the client waits until its mirrored state has reached the worker state version observed by that method result. If the result arrives before the corresponding state message, the client requests a snapshot sync and resolves or rejects the method promise only after the local mirror is caught up.

Disposal is terminal on both sides. `host.dispose()` first starts app disposal, which aborts plugin setup through `PluginContext.signal`, and only then waits for startup to settle; this prevents initialization/disposal deadlocks. Repeated host disposal shares one promise. If disposal wins the race with initial state publication, `host.ready` rejects instead of reporting a host that never became observable as ready. `client.dispose()` rejects pending calls and all later `call()` / module-proxy requests immediately instead of posting work that can no longer receive a response.

### The option surface

`createWorkerClient` takes ten options and `createWorkerApp` nine, which grew one reliability or safety fix at a time. Only `transport` is required; everything else has a default tuned for a trusted, reliable channel — a dedicated `Worker`, a `MessagePort`, a same-origin iframe you control. Reach past `transport` when one of these concerns applies, not before:

| Concern                      | Client                                                           | Host                                            |
| ---------------------------- | ---------------------------------------------------------------- | ----------------------------------------------- |
| **Connect**                  | `transport`, `signal`                                            | `transport`, plus every `createApp` option      |
| **Timeouts and recovery**    | `requestTimeout`, `readyTimeout`, `requestInitialSync`, `resync` | —                                               |
| **What is reachable**        | —                                                                | `expose`, `stateSections`, `sync`               |
| **What a peer may cost you** | `limits`                                                         | `limits`, `includeErrorStack`, `serializeError` |
| **Observers**                | `onConflict`, `onResync`, `onInvalidMessage`                     | `onInvalidMessage`, `onDeliveryError`           |

Observers never alter protocol handling: throwing from one is contained and cannot change what the endpoint does with a message.

### Client readiness

`client.ready` never stays pending indefinitely. Three controls settle it:

| Option               | Default | Effect                                                                                      |
| -------------------- | ------- | ------------------------------------------------------------------------------------------- |
| `readyTimeout`       | `30000` | Rejects with `WorkerReadyTimeoutError` when no snapshot arrives in time. `0` waits forever. |
| `requestInitialSync` | `true`  | Asks the host for a snapshot at construction instead of waiting to be published to.         |
| `signal`             | —       | Aborting rejects `ready` with `WorkerHostUnavailableError` (and aborts in-flight calls).    |

If the initial sync request cannot even be posted, `ready` rejects with `WorkerInitialSyncError` whose `cause` is the transport failure. Because a client asks for its own snapshot — and asks again whenever the host announces `ready` — a client that attaches _after_ the host published still catches up rather than hanging.

A rejected `ready` does not disable the client: a snapshot that arrives later is still applied, and it reaches `client.subscribe` listeners and watches registered with `immediate: true`. A default `watch` takes that first snapshot as its baseline and fires from the next change. `ready` simply cannot re-settle, so treat its rejection as "startup was not observed in time", not as "this client is dead". The one exception is `WorkerProtocolMismatchError`: a client that refused its host stays refused.

RPC calls default to a 30-second timeout (`requestTimeout` on `createWorkerClient`; `0` disables it). Use `callWithOptions()` for a per-call timeout or `AbortSignal`. Remote invocation is restricted to methods explicitly listed in the module's `actions` metadata; ordinary methods, lifecycle hooks, computed properties, and arbitrary callable fields are not remotely exposed by default. When a plain method intentionally belongs to the RPC surface, list it by module name with `createWorkerApp({ expose: { counter: ["refresh"] }, ... })`.

## Trust boundary

Every inbound protocol envelope is runtime-validated: call IDs, module/method names, argument arrays, result errors, state versions/sections, sync fields, and patch operations/paths must match the complete message schema. Malformed input is dropped and can be observed with `onInvalidMessage`. Unsafe patch path segments such as `__proto__` are rejected.

The host also stamps `workerProtocolVersion` on its `ready` handshake and on every frame that carries the full state, so a client that attaches after the handshake still meets it on its first snapshot. A client seeing a different revision rejects `client.ready` with `WorkerProtocolMismatchError`, rejects its calls with the same error, and ignores that host's frames rather than mirroring frames it may misread — both endpoints must come from the same `@coexist/core` version. The check compares wire revisions, not package versions, and a host whose frames carry no revision predates versioning and is accepted.

Schema validation says nothing about size, so both endpoints also enforce quotas. Tune them with `limits` on `createWorkerApp` / `createWorkerClient`:

| Limit                  | Default | Enforced by | Effect when exceeded                                        |
| ---------------------- | ------- | ----------- | ----------------------------------------------------------- |
| `maxCallArgs`          | `100`   | host        | The call is answered with an error and reported as invalid. |
| `maxPatchesPerMessage` | `10000` | client      | The state message is dropped and reported as invalid.       |
| `maxPatchPathDepth`    | `100`   | client      | The state message is dropped and reported as invalid.       |
| `maxPendingCalls`      | `1000`  | client      | New calls reject instead of queueing without bound.         |

A remote error crosses the transport as `{ name, message }` only. Stacks stay on the host, because they name local file paths, the source layout, and internal function names — information a client on another origin, socket, or process should not receive. Opt in with `createWorkerApp({ includeErrorStack: true })` for a trusted same-trust-domain channel, or replace the shape entirely with `serializeError`. The host still observes the full error locally through its own plugin `onError` hooks.

Schema validation and the action allowlist limit capabilities, but a bare `WorkerTransport` does not authenticate its peer. Connect bare/custom and data-transport adapters only to trusted endpoints, or enforce authentication in the underlying channel. For cross-origin/ambient channels, use the adapter controls below:

- `createPostMessageWorkerTransport`: set `targetOrigin`, `allowedOrigins`, and `expectedSource` for iframe/window messaging. Omitting them is appropriate only for dedicated `Worker`/`MessagePort` endpoints already held as trusted capabilities.
- `createBroadcastWorkerTransport`: set the same unpredictable `authToken` on host and clients. Messages with a different token are ignored. A `BroadcastChannel` peer can observe traffic, so this is a routing capability, not cryptographic authentication; use it only among trusted same-origin code or put the protocol over an authenticated custom transport.

  A broadcast transport rewrites inbound call/sync IDs so replies can be addressed back to the originating peer, and it retains at most 1024 unanswered routes. A reply whose route is missing — because the request never arrived on this transport, or because the backlog evicted it — is not posted, and the failure is reported through `onError`; broadcasting it would risk settling an unrelated pending call on another peer.

## Transports

A transport is just `{ post(message), subscribe(listener) }`. The package ships adapters for the common channels — all interchangeable:

`post()` returns `void | Promise<void>`, and **a transport that cannot deliver must throw or reject**. That failure is not decoration: the client uses it to fail the affected call immediately instead of waiting out `requestTimeout`, and the host uses it to publish the next update as a full snapshot instead of a patch on top of a version the peer never received. Hosts observe those failures with `createWorkerApp({ onDeliveryError })`; the built-in adapters additionally report them through their own `onError` before propagating.

| Factory                                             | Use for                                     |
| --------------------------------------------------- | ------------------------------------------- |
| `createMemoryWorkerTransportPair()`                 | In-process host/client pair (tests, demos). |
| `createPostMessageWorkerTransport(endpoint)`        | `Worker`, iframe, or `MessagePort`.         |
| `createBroadcastWorkerTransport(channel, opts)`     | Shared tabs via `BroadcastChannel`.         |
| `createDataTransportWorkerTransport(dataTransport)` | Process/socket/custom RPC.                  |

A `MessagePort` — either end of a `MessageChannel`, or a `SharedWorker` port — needs no extra setup: the postMessage transport subscribes with `addEventListener`, which leaves a port's queue disabled, so it calls `start()` on the port itself.

### Web Worker

```ts
// worker.ts
import { createPostMessageWorkerTransport, createWorkerApp } from "@coexist/core";
createWorkerApp({
  providers: [Counter],
  sync: "patch",
  transport: createPostMessageWorkerTransport(globalThis as any),
});

// main.ts
const worker = new Worker(new URL("./worker.ts", import.meta.url), {
  type: "module",
});
const client = createWorkerClient({
  transport: createPostMessageWorkerTransport(worker),
});
await client.ready;
```

For an iframe, bind both directions explicitly instead of using wildcard origins:

```ts
const transport = createPostMessageWorkerTransport(window as any, {
  source: window as any,
  target: iframe.contentWindow as any,
  targetOrigin: "https://trusted.example",
  allowedOrigins: ["https://trusted.example"],
  expectedSource: iframe.contentWindow,
});
```

### Shared tabs (BroadcastChannel)

Clients request their own initial snapshot, so they may attach before or after the host starts. A channel has exactly one host, addressed by a fixed `peerId`; every other tab runs a client that targets it with `targetPeerId`:

```ts
// Every tab: a client. Without an explicit `peerId`, each tab's transport gets
// its own id, so a result routed back to one tab never settles another's call.
const client = createWorkerClient({
  transport: createBroadcastWorkerTransport(new BroadcastChannel("counter"), {
    authToken: sharedRandomCapability,
    targetPeerId: "tab:host",
  }),
});

// One tab only: the host, under the id the clients target.
const host = createWorkerApp({
  providers: [Counter],
  sync: "patch",
  transport: createBroadcastWorkerTransport(new BroadcastChannel("counter"), {
    authToken: sharedRandomCapability,
    peerId: "tab:host",
  }),
});
```

Client ids must be unique on a channel. Replies are routed by `peerId`, and each client numbers its calls from 1, so two tabs that share an id settle each other's calls with the wrong results. Keep the default, or derive an explicit id per tab, such as `` `tab:${crypto.randomUUID()}` ``.

The runtime does not elect the host. Start `createWorkerApp` in exactly one tab, for example the tab that holds a [Web Lock](https://developer.mozilla.org/docs/Web/API/Web_Locks_API). Two hosts under the same id both answer every call, so each action runs twice and their states diverge. Nor does the runtime hand over between hosts: a replacement host starts its own version sequence, and clients that mirrored the previous host ignore its frames as stale until that sequence passes theirs. Recreate the clients when the host changes.

Tests and non-browser environments can use `createMemoryBroadcastChannel()` with the same API.

## Sync modes

`createWorkerApp({ sync })` controls how the host publishes state:

- `"snapshot"` (default) — sends a full state snapshot on each change.
- `"patch"` — sends the initial snapshot, then **patch-only** diffs. The client applies patches locally, in the order the engine recorded them, including the `length` replacement that truncates an array. Requires fewer bytes for large state.

The host enables patch generation internally for `"patch"` mode.

Patch mode saves bytes only while the app state is a plain tree: objects with the default prototype, dense arrays, and primitives, with no object reachable twice. When any module's state holds something else — a `Map`, `Set`, `Date`, class instance, or a shared reference — Coaction describes every commit as a replacement of the whole state (`path: []`), so each update carries the full state, and a host with `stateSections` publishes a filtered snapshot instead. The mirror stays correct either way. Keep that state as plain data (an object keyed by id instead of a `Map`, an array instead of a `Set`, a timestamp instead of a `Date`) when patch sync is meant to keep messages small.

## Isolating state sections

A host can publish only selected top-level module slices with `stateSections`. Method delegation still works for **all** hosted modules, but snapshots and patches only include the configured sections:

```ts
createWorkerApp({
  providers: [Counter, Secret],
  stateSections: ["counter"], // "secret" stays private to the host
  sync: "patch",
  transport: hostTransport,
});
```

## Conflict handling

The client can observe sync anomalies via `onConflict`:

```ts
const client = createWorkerClient({
  transport: clientTransport,
  onConflict(event) {
    console.warn(event.reason, event.currentVersion, event.incomingVersion);
  },
});
```

`WorkerConflictReason` is one of:

| Reason               | Meaning                                           |
| -------------------- | ------------------------------------------------- |
| `stale-message`      | A message older than the current version arrived. |
| `missing-snapshot`   | A patch arrived before any snapshot.              |
| `version-gap`        | A patch skipped a version (a message was lost).   |
| `patch-apply-failed` | A patch could not be applied to local state.      |

### Automatic recovery

`missing-snapshot`, `version-gap`, and `patch-apply-failed` all mean the mirror can no longer be repaired from patches — every later patch would gap again. The client therefore requests a fresh snapshot instead of only reporting the anomaly. (`stale-message` is benign and never triggers recovery.)

`client.state.status` tracks the mirror, and `onResync` reports each transition:

| Status       | Meaning                                                            |
| ------------ | ------------------------------------------------------------------ |
| `synced`     | The mirror tracks the host.                                        |
| `recovering` | A conflict was seen; a snapshot request is scheduled or in flight. |
| `failed`     | `maxAttempts` snapshot requests went unanswered.                   |

```ts
const client = createWorkerClient({
  transport: clientTransport,
  resync: {
    delay: 100,
    backoffFactor: 2,
    maxDelay: 5000,
    maxAttempts: 5,
    timeout: 10_000,
  },
  onResync(event) {
    console.warn(event.status, event.reason, event.attempt);
  },
});
```

Recovery is single-flight: a burst of conflicts collapses into one run, `delay` debounces it, and each unanswered attempt backs off by `backoffFactor` up to `maxDelay`. A run that exhausts `maxAttempts` reports `failed` and stops; a later conflict starts a new run, but at `maxDelay`, so a host publishing unusable patches cannot turn recovery into a request loop. A failed run does not disable the client — the last good state stays readable.

Pass `resync: false` to keep the report-only behaviour and hold the stale snapshot.

This is snapshot recovery for a mirror that fell behind, not conflict _resolution_: concurrent writes from several peers are still not merged.

## Consuming from a UI framework

Every adapter ships `WorkerClient`-based helpers, so worker state renders just like local state:

```tsx
// React
import { WorkerClientProvider, useWorkerModule, useWorkerSelector } from "@coexist/react";

function View() {
  const counter = useWorkerModule<Counter>("counter");
  const count = useWorkerSelector((s) => (s as State).counter.count);
  return <button onClick={() => counter.increase()}>{count}</button>;
}

<WorkerClientProvider client={client}>
  <View />
</WorkerClientProvider>;
```

See [UI Adapters](./ui-adapters.md#consuming-worker-hosted-state) for the per-framework helper names.

<a id="what-the-beta-covers-and-doesnt" name="what-the-beta-covers-and-doesnt"></a>

## What the runtime covers (and doesn't)

Covered: app creation, method delegation, initial snapshots, patch-only sync after startup, bounded client readiness, snapshot recovery after a lost patch, a delivery contract that surfaces transport failures, protocol size quotas, selector watches, `postMessage` endpoints, a `data-transport`-style `listen`/`emit` bridge, and BroadcastChannel shared-tab coordination with routed call results.

Not covered: full shared-runtime conflict _resolution_ (the host is authoritative and reports conflicts, while a client re-syncs a stale mirror; it does not merge competing writes) and framework-specific worker bootstrapping. It reuses Coaction's transport/worker primitives rather than reimplementing a full shared runtime.

**This is stable, not a prototype and not a distributed-systems consensus layer.** Over a trusted, reliable transport — a dedicated `Worker`, a `MessagePort`, a same-origin iframe you control, or a trusted `BroadcastChannel` — it is meant to be depended on. If you need merge semantics, offline queueing, or an adversarial transport boundary, those are out of scope rather than planned for a later release. [Scope & Stability](./scope-and-stability.md#the-worker-runtime) states exactly what Stable covers.

## Operating checklist

- Create the `Worker` yourself, bundle its entry, and connect it with a `postMessage` transport. A `WorkerClient` does not spawn or terminate the `Worker` for you. The runnable [`worker-counter`](../examples/worker-counter) example shows the smallest end-to-end setup.
- Await `client.ready` before mounting views that read worker state: the adapter helpers call `client.select`, which throws until a snapshot has arrived. A timeout or an abort is not final, because a snapshot that lands later is still applied. Show a connecting state the app can leave, and mount once `client.subscribe` or a `watch` with `immediate: true` reports the first frame. Only `WorkerProtocolMismatchError` is final.
- Dispose both ends. `client.dispose()` rejects pending calls; `host.dispose()` disposes the hosted app, not the `Worker` object itself.
- Observe `onDeliveryError` on the host and `onConflict`/`onResync` on the client; a silent transport failure is otherwise indistinguishable from a slow action.
- Deploy host and client from the same `@coexist/core` version. A client refuses a host that speaks another wire revision — `client.ready` and its calls reject with `WorkerProtocolMismatchError`, and none of that host's frames are mirrored — but releases that share a revision are not told apart.
- Keep transports trusted. Use `targetOrigin`/`allowedOrigins`/`expectedSource` for iframes, and an authenticated channel for cross-origin RPC; a bare transport does not authenticate its peer.

## Next

- [`@coexist/core` worker reference](../packages/core/README.md#worker--shared-runtime)
- The runnable [`worker-counter`](../examples/worker-counter) example.
