# @coexist/core

## 0.3.0

### Minor Changes

- 37d4391: Stop discarding container cleanup when `createApp()` fails. The rollback path fired `container.dispose()` and swallowed the result, so an async provider disposer was still running when the caller received the error and its failure vanished entirely — a failed creation could leave a connection or handle open with no way to find out. The thrown error now carries that disposal promise: `getAppCreationCleanup(error)` returns it, resolving once creation's resources are released and rejecting with whatever release failed on. The rejection stays internally observed, so ignoring it is still safe.
- cdb149c: Narrow what `App.store` promises. It was typed as the underlying Coaction `Store` in full, which put an external package's entire type — `destroy()`, `getInitialState()`, `name`, `share`, `transport`, `patch`, `trace` — inside Coexist's own contract, made any Coaction change a potential Coexist change, and let application code destroy the store the runtime owns and disposes. `App.store` is now an `AppStore`: `getPureState`, `getState`, `setState`, `apply`, and `subscribe`, with unchanged signatures. Every documented use keeps working; code reaching for the removed members no longer compiles. `AppStore` and `AppRootState` are exported.
- 6cc87af: Type `defineModule()` metadata against the class it describes. The property lists were `readonly PropertyKey[]`, unrelated to the class, so `state: ["cout"]` compiled and then silently gave the instance a reactive property that read `undefined` and wrote into the store — a typo in the decorator-free path, which the docs recommend as the portable default, produced no error anywhere. `state` and `computed` now accept only `keyof` the instance type, `actions` and `effects` only its callable members, and `DefineModuleOptions` takes the instance type as a parameter (defaulting to the previous permissive shape for callers that build options without a class in hand). Metadata that already matched its class is unaffected; metadata that never did now fails to compile. One case compiled and worked before and no longer compiles: `keyof` does not see `private` or `protected` members, so a module that listed a non-public field in `state` or `computed` now has to make it public — which it arguably always should have been, since module state goes into the shared app store where persistence, devtools, and worker sync all read it, and no adapter selector can reach a non-public field either. Where a module must keep one non-public, widen the target through a shape interface (`defineModule(Cart as unknown as Constructor<CartShape>, …)`), which keeps the names checked against that shape.
- fix
- de6d263: Bound `WorkerClient.ready`. It previously settled only on the first state snapshot or on disposal, so a host that never started, a dropped snapshot, a client that attached too late, or a transport that silently discarded messages left `await client.ready` pending forever — and the documented "wait for ready before rendering" pattern turned that into a stalled app. Clients now request their own initial snapshot (`requestInitialSync`, default on) and re-request one whenever the host announces `ready`, reject after `readyTimeout` (default 30s, `0` waits forever) with `WorkerReadyTimeoutError`, reject on an aborted `signal` with `WorkerHostUnavailableError`, and reject with `WorkerInitialSyncError` when the request cannot be posted. A settled-by-failure `ready` no longer disables the client: a later snapshot is still applied.
- 73889f5: Recover a worker client mirror that fell behind its host. `missing-snapshot`, `version-gap`, and `patch-apply-failed` were only reported through `onConflict`, and the internal snapshot sync only ran when an RPC result advertised a newer state version — so a client that just watches state stayed on its stale snapshot forever, with every later patch producing another gap. Those three conflicts now start a single-flight snapshot request with debounce, capped exponential backoff, per-attempt timeout, and a bounded attempt count. `client.state.status` exposes `synced` / `recovering` / `failed`, `onResync` reports each transition, and `resync: false` keeps the previous report-only behaviour.

  **Breaking for hand-written client doubles:** `WorkerClient["state"]` gained a required `status`, so an object literal typed as `WorkerClient` — a stub in a test, say — no longer compiles until it supplies one. Add `status: "synced"` alongside `version`. Clients built by `createWorkerClient` are unaffected.

- e634fb6: Bound what one worker peer can make the other allocate. Protocol messages were validated for shape but not for size, so well-formed traffic — an unbounded argument list, a message carrying millions of patches, a deeply nested patch path, or calls queued faster than the host answers — could spend the receiving endpoint's memory and CPU. `createWorkerApp` and `createWorkerClient` now accept `limits` with `maxCallArgs` (100), `maxPatchesPerMessage` (10000), `maxPatchPathDepth` (100), and `maxPendingCalls` (1000). An oversized call is answered with an error so the caller does not wait out its timeout; an oversized state message is dropped and reported through `onInvalidMessage`.
- 577ae11: Version the worker wire protocol. Both endpoints were already required to come from the same `@coexist/core` version, but nothing checked: a mismatched pair connected happily and then misread each other's frames as corrupted state, missing methods, or silent staleness. The host now stamps `workerProtocolVersion` on its `ready` handshake, and a client seeing a different revision rejects `client.ready` with `WorkerProtocolMismatchError` instead of mirroring what it cannot parse. A handshake carrying no version predates this and is still accepted, so an older host keeps working.
- 1641d30: Stop sending remote error stacks to worker clients by default. A failed remote call serialized `error.stack` unconditionally, so every rejection handed the peer local file paths, the source directory layout, internal function names, and build structure — across iframes, sockets, and processes as readily as across a same-origin Worker. Errors now cross as `{ name, message }`; opt stacks back in for a trusted channel with `createWorkerApp({ includeErrorStack: true })`, or replace the payload entirely with `serializeError`. The host still sees the complete error through its own error reporting.
- 8be0a32: Give `WorkerTransport.post()` a delivery contract. It now returns `void | Promise<void>` and must throw or reject when a message cannot be delivered. The client already assumed this — it failed a call when `post()` threw — but every built-in adapter swallowed the failure into `onError`, so a synchronous failure only surfaced after the 30-second request timeout, an asynchronous one never correlated with its call at all, and the host advanced its published state version for a snapshot that never arrived and then kept sending patches on top of it. The postMessage, broadcast, and data-transport adapters now propagate failures after reporting them, the client fails calls and sync requests on both synchronous and asynchronous delivery errors, `host.ready` rejects when the initial snapshot cannot be published, and a failed state publish makes the next update a full snapshot. Hosts observe delivery failures with `createWorkerApp({ onDeliveryError })`.

### Patch Changes

- d0b93d6: Hold every UI adapter to one shared behaviour contract, and add a scaling benchmark. The five adapters share no implementation, so each could drift from the others unnoticed — a real bug where the Svelte worker client shadowed component context showed how. `packages/integration/src/adapterConformance.ts` now runs one spec against React, Vue, Svelte, Solid, and Angular: the resolved module is the facade the app owns, a selector starts from the current value and follows later actions, two apps observed at once stay isolated, a disposed scope stops following the app, and a missing app raises an error rather than returning `undefined`. `pnpm run bench` measures what the single-publication invalidation model costs as selectors, modules, and state depth grow, and how snapshot and patch worker payloads compare — the baseline any change to that model should be argued against.
- 5b522a4: Record the unexported types the public surface is built from. The API report rendered each export's own declaration and stopped there, so a type the package never exports but every consumer depends on was invisible to it — `ClassProvideOptions` and `FactoryProvideOptions` showed only their own fields while inheriting the rest from `ProviderOptionsBase`, `DefineModuleOptions` printed `ModuleMethodKey` without saying what it is, and the five message shapes behind the exported `WorkerMessage` union, which anyone implementing a `WorkerTransport` has to construct and read, appeared nowhere. Changing any of them altered the public API with nothing in the report to review, which is the one thing it exists to prevent. Reports now follow an export's references into the package's own build and render what they find under a marked section, transitively. Types from a dependency or from `lib.d.ts` are still left as bare names — they are not this package's API to report.
- f4c18eb: Bound the pending call/sync routes a broadcast worker transport retains, and stop posting replies whose route is missing. A peer that never answered — a disposed host, or a sync request whose app failed to start — previously kept its route forever, and an unroutable reply was broadcast with an internal routing id that could settle an unrelated pending call on another peer. Such replies are now reported through `onError` instead.
- 7a8cf07: Cover the paths that had none, and raise the floors so they stay covered. The collaborators split out of `RuntimeApp` shipped with the thinnest tests in the repo — `moduleRegistry` and `effectRuntime` sat at 50% and 71% branch coverage — and several long-standing files were no better: `token` at 47%, `decorators` at 56%, `async-context` at 50%, the scaffold CLI at 25%, the router at 72%, and a third of the storage service surface never called. The gaps were all error handling and fallbacks: duplicate-module detection, a disposer that throws mid-teardown, staged-rollback baselines, decorator target guards, every runtime without `node:async_hooks`, the CLI's failure and `--force` paths, `createBrowserRouter` without a window, a terminal error observer that itself rejects, and each storage delegation. Those files now sit at 94–100%, the repository floors move from 85/78/88 to 89/83/92, and the four collaborators extracted from `RuntimeApp` each gained a unit test and a floor of their own — including the mutation cascade cap, which nothing had exercised at the unit level despite being the reason that class exists.
- 51a6c65: Add seeded fuzz coverage for the worker protocol and the app lifecycle, and enforce coverage floors. Coverage was measured but never gated, and `passWithNoTests` meant a package whose tests all vanished still reported success — so both the number and the reach of the tests could quietly shrink. `test:coverage` is now part of `check` and CI with global thresholds plus a higher bar for `packages/core/src/**`, a project with no tests fails, and two seeded suites assert invariants over input spaces too large to enumerate by hand: arbitrary protocol messages and patch paths (no throw escapes, the mirror keeps a clean prototype, `Object.prototype` stays unpolluted, a rejected patch never mutates the snapshot) and interleaved `start`/`stop`/`ready`/`dispose` sequences (hooks stay balanced, disposal is terminal, no unhandled rejections).
- 115fb51: Declare `engines.node` on every published package. The documentation said the Node floor was `>=22.12.0`, "matching the `engines` field" — but only the private workspace root carried one, so nothing reached a consumer: installing on Node 20 produced no warning, and the first sign of trouble was a syntax or API error at runtime. Each package now declares `>=22.12.0` itself, which is the version CI has been testing against all along. If you install on an older Node your package manager will now say so; with `engine-strict` it will refuse, which is the intent.

  The peer-range table and Node floor in `docs/scope-and-stability.md` are also checked against the manifests now (`test:docs-versions`). That page opens by saying it is updated with the code rather than aspirationally, and those two claims were hand-copied numbers that nothing verified.

- 2b8c134: Keep lazily loaded module slices reactive after their state is committed. Previously a lazy module stayed detached for its whole lifetime, so its `@Effect` methods ran once and never reran, and its `@Computed` getters recomputed on every read instead of caching. Both now behave the same as eagerly registered modules.
- e899066: Split the mutation scheduler out of `RuntimeApp`, with no behaviour change. Deferring a write made while the store is already committing depended on four fields — two depth counters, a queue, and a reentrancy flag — touched from seven methods, and reading any one without the others could not tell you whether a write was safe. `MutationScheduler` now owns that rule as one object's invariant: when to queue, how a failed commit discards what it had scheduled, how notification defers listener writes, and how a self-triggering cascade is capped rather than allowed to spin. `RuntimeApp` is down to 28 fields.
- 7ba4f75: Record every package's public API in a committed report and verify it in CI. A version number says a release is breaking but not what broke: a removed export, a parameter that became required, or a widened return type all shipped with nothing drawing a reviewer's eye to them, because the only evidence was inside the diff of the implementation. `api-report/` now holds one file per published package, generated from the built declarations, re-printed through the TypeScript printer and sorted by name so it moves only when the API moves. `test:api-report` fails the build when the built surface drifts from the committed report, and `pnpm run api-report:update` accepts an intended change — which is the point at which the changeset should say so.
- 88f9b6a: Close three gaps found reviewing the worker and scaffold changes. A sync request that resumed after the host store became unreadable escaped as an unhandled rejection, because the publish moved outside the handler's `try` when the delivery contract landed but the caller cannot await it — it is reported through `onDeliveryError` again. An initial snapshot that failed delivery asynchronously neither reached `onDeliveryError` nor forced the next update to be a full snapshot, unlike a synchronous failure. And `createCoexistProject()` stopped creating missing parent directories when it began staging files in a sibling directory, so `create-coexist apps/web` failed with a raw `ENOENT` unless `apps` already existed.
- 9ff9faa: Split three collaborators out of `RuntimeApp`, with no behaviour change. Lifecycle state lived in five booleans and four promise fields (`isInitialized`, `isStarted`, `shouldBeStarted`, `isDisposing`, `isDisposed`, plus the init/start/stop/transition promises) read and written from a dozen methods, so nothing prevented a combination that cannot occur and every new branch re-derived which combinations were legal. Effect disposers and in-flight async runs, and the module list with its two indexes, were spread the same way — a lazy-module rollback had to update several of them consistently by hand. `AppLifecycleController` now owns the lifecycle machine, `EffectRuntime` owns effect tracking and teardown, and `ModuleRegistry` owns the ordered module list with its token and name indexes. `RuntimeApp` keeps the action/mutation/publication machinery and the lazy-module loader for now.

## 0.2.1

### Patch Changes

- Version alignment release with no public API changes in this package.

## 0.2.0

### Minor Changes

- c91cebc: Allow plugins to contribute non-module providers, have the router plugin provide `RouterToken`, and flush storage writes through plugin context disposal.
- 51a2645: Rename decorator APIs to PascalCase: `Module`, `State`, `Action`, `Computed`, and `Effect`.
- 14e063c: Add explicit plugin and module lifecycle injectors so awaited hooks remain isolated across concurrently initializing browser apps without leaking a global resolution context.
- 80c4e58: Add `PluginContext` with managed disposers and `watch`, and isolate observer hook errors through plugin error hooks.

### Patch Changes

- c9e64c3: Make lazy-module state publication atomic with synchronous effect startup so a failed effect emits no transient state, watch, patch, or app-version update before rollback.
- 6aec125: Coalesce concurrent lazy module loads and stage lifecycle work in a temporary scope so failures roll back state, effects, metadata, registrations, and resources before a clean retry.
- 289305a: Enforce strict actions for nested state, arrays, and direct store mutation APIs, add an app-level action boundary for controlled whole-store updates, and use it for storage hydration.
- ee5301b: Make app and container disposal terminal, continue every cleanup phase after failures, aggregate teardown errors, and release resources produced by in-flight async providers.
- 98b4aa2: Return detached, recursively frozen plain snapshots from `store.getPureState()` in strict-actions apps so raw object or array writes cannot bypass action enforcement.
- 26ce33f: Support nested and cross-module action composition. Actions invoked while
  another action is running now reuse the open root draft instead of calling
  `setState` again, which Coaction rejects while a commit is open. Cross-module
  state writes inside an action are routed into the active commit and are
  allowed under `strictActions`. Everything inside the outermost action merges
  into a single commit: one state notification and one patch set, rolled back
  as a whole if the outermost action throws.
- 5f71742: `getModule` and `getModuleByName` now resolve modules registered on a parent
  app instead of throwing a misleading "not a Coexist module" error for a
  token the child container can already resolve. Unregistered tokens still
  surface `MissingProviderError`.
- e7c81ad: Add explicit provider auto-disposal ownership, keep external values and aliases unowned by default, let custom disposers replace convention disposal, and make storage destroyOnDispose authoritative.
- 159ffbe: Queue actions, action boundaries, state writes, and direct store mutations
  dispatched synchronously from `watch` listeners or plugin state hooks until the
  in-flight engine commit and notification batch finish. Queued work still runs
  before the triggering mutation returns, and unbounded cascades abort after
  1000 mutations with a clear error.
- 95d00bb: Reject lifecycle-control and readiness reentry from app-managed async work instead of allowing setup, hooks, effects, or teardown callbacks to deadlock the app.
- 0751a50: Remove the unused `rxjs` peer dependency from `@coexist/angular`.
  `@coexist/core` now builds with a neutral platform target and uses the same
  `.js`/`.d.ts` output convention as the other browser-and-server packages.
- 027171e: `createApp` now requires every module to declare an explicit `name` in its
  `@Module()`/`defineModule` metadata instead of deriving one from the class
  name. Derived names break under minification: state slices, persisted
  snapshots, and worker calls are all addressed by module name.
- f931e31: Validate complete worker protocol schemas, expose only declared actions, add RPC timeout and AbortSignal controls, and secure ambient postMessage/BroadcastChannel transports with origin, source, targetOrigin, and capability-token options.
- 38f4014: Reject scoped, resolution, and transient Coexist modules so dependency injection and the single bound app store slice always share one singleton module instance.
- 77bddf0: Expose stable app initialization readiness, observe initialization failures internally, reject lifecycle start reentry, and preserve imperative injection across awaited lifecycle work.
- a02235b: Notify app watchers once per store mutation and isolate synchronous or asynchronous listener failures from committed actions through the watch error phase.
- 1abd56b: Share in-flight async providers across singleton and resolution scopes, retry failed factories, and keep imperative `inject()` inside the active resolution graph.
- 38b8aa3: Reject module lookup and writes after app disposal, including actions and deep state mutations through module facades or state references retained before teardown.
- e1336a0: Track async provider work discovered through synchronous resolution so fulfilled resources remain cached or container-owned and are disposed without leaks.
- e3c3fff: Upgrade the runtime dependency to Coaction 3.1.0, consume its reactive tracker
  from the public `coaction/adapter` entry point, and preserve dynamic lazy-module
  state behind Coaction's fixed root schema.
- f9c4c3c: Allow worker hosts to opt ordinary module methods into remote invocation with
  the new `createWorkerApp({ expose })` allowlist. Declared module actions remain
  remotely callable by default; lifecycle hooks, helpers, and other methods stay
  private unless explicitly listed by module name.
- 71e762e: Abort worker app initialization before awaiting host readiness during disposal, make host disposal idempotent, and reject new client RPC calls after client disposal.

## 0.1.0

### Major Changes

- Release Coexist 0.1 with the app runtime, lightweight DI, module decorators and no-decorator metadata, framework-native UI adapters, worker/shared runtime transports, persistence, router, devtools, testing helpers, examples, and CI/CD publishing support.

### Minor Changes

- 11db34e: Add BroadcastChannel-style worker transport for shared tab coordination, including routed call results and an in-memory broadcast channel for tests.
- 2e01e3a: Add explicit action boundaries with `app.runInAction()` and `runInAction(module, callback)` so strict action mode can be preserved across awaited work.
- 5385bd5: Add `createPostMessageWorkerTransport()` for Web Worker, iframe, and MessagePort-style endpoints.
- 2f51753: Advance the Coexist runtime toward the v0.1 application model:

  - add explicit lazy modules with `lazyModule()` and `app.load()`
  - add async container construction through `buildAsync()`
  - run worker hosts through app startup before publishing the initial snapshot
  - expose a data-transport-compatible worker transport adapter
  - add module effects, cached computed getters, eager provider instantiation, and settled async action reporting
  - add router lifecycle bridging and queued storage persistence controls

- 366eb38: Expose `WorkerClient.ready`, resolving after the initial state snapshot is available and rejecting if the client is disposed first.
- 177ca9a: Add `WorkerClient.select()` and `WorkerClient.watch()` for selector-based reads of worker-hosted state.
- 794566f: Add worker client conflict hooks for stale messages, missing snapshots, patch version gaps, and patch application failures.
- 77cd9a9: Add patch-only worker state synchronization with client-side patch application.
- 80f25e8: Add worker state section filtering with `stateSections` so worker hosts can publish isolated top-level module slices.

### Patch Changes

- Ensure delegated worker method promises settle only after the client state mirror reaches the worker state version associated with the result.
- 8d18a9a: Return the bound Coexist module facade from `app.get()` and `app.getAsync()` for module tokens, even when the provider scope is not singleton.
