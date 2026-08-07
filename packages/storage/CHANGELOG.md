# @coexist/storage

## 1.0.0

### Minor Changes

- a2e8b0e: Declare `@coexist/core` as a peer dependency instead of an ordinary one. Each adapter and plugin pinned core exactly, so an app on a different core version got a second copy installed under the adapter: `instanceof CoexistError` stopped working across that boundary, two runtimes disagreed on protocol and lifecycle assumptions, and bundles carried the runtime twice. Core is now `peerDependencies: { "@coexist/core": "^<version>" }` plus a workspace devDependency, so one runtime is shared. Installs that already list `@coexist/core` alongside the adapter — as every README instructs — need no change. The pack smoke now fails if a package regresses to depending on core directly.
- fix

### Patch Changes

- 7a8cf07: Cover the paths that had none, and raise the floors so they stay covered. The collaborators split out of `RuntimeApp` shipped with the thinnest tests in the repo — `moduleRegistry` and `effectRuntime` sat at 50% and 71% branch coverage — and several long-standing files were no better: `token` at 47%, `decorators` at 56%, `async-context` at 50%, the scaffold CLI at 25%, the router at 72%, and a third of the storage service surface never called. The gaps were all error handling and fallbacks: duplicate-module detection, a disposer that throws mid-teardown, staged-rollback baselines, decorator target guards, every runtime without `node:async_hooks`, the CLI's failure and `--force` paths, `createBrowserRouter` without a window, a terminal error observer that itself rejects, and each storage delegation. Those files now sit at 94–100%, the repository floors move from 85/78/88 to 89/83/92, and the four collaborators extracted from `RuntimeApp` each gained a unit test and a floor of their own — including the mutation cascade cap, which nothing had exercised at the unit level despite being the reason that class exists.
- 115fb51: Declare `engines.node` on every published package. The documentation said the Node floor was `>=22.12.0`, "matching the `engines` field" — but only the private workspace root carried one, so nothing reached a consumer: installing on Node 20 produced no warning, and the first sign of trouble was a syntax or API error at runtime. Each package now declares `>=22.12.0` itself, which is the version CI has been testing against all along. If you install on an older Node your package manager will now say so; with `engine-strict` it will refuse, which is the intent.

  The peer-range table and Node floor in `docs/scope-and-stability.md` are also checked against the manifests now (`test:docs-versions`). That page opens by saying it is updated with the code rather than aspirationally, and those two claims were hand-copied numbers that nothing verified.

- a46f554: Make `StoragePlugin.ready()` wait for hydration it can actually observe. Both plugins started from an already-resolved promise and only replaced it inside `setup()`, but `createApp()` schedules plugin setup on a later microtask — so the documented `const plugin = createStoragePlugin(...); createApp({ plugins: [plugin] }); await plugin.ready();` sequence resolved before hydration had begun, and callers read pre-hydration state. `ready()` is now backed by a deferred promise created with the plugin and settled when hydration finishes or fails; it also rejects when the app tears down without ever running the plugin's setup. The imperative write methods still work on a plugin that was never installed.
- Updated dependencies [d0b93d6]
- Updated dependencies [5b522a4]
- Updated dependencies [37d4391]
- Updated dependencies [f4c18eb]
- Updated dependencies [7a8cf07]
- Updated dependencies [51a6c65]
- Updated dependencies [115fb51]
- Updated dependencies [2b8c134]
- Updated dependencies [e899066]
- Updated dependencies [cdb149c]
- Updated dependencies [7ba4f75]
- Updated dependencies [88f9b6a]
- Updated dependencies [9ff9faa]
- Updated dependencies [6cc87af]
- Updated dependencies
- Updated dependencies [de6d263]
- Updated dependencies [73889f5]
- Updated dependencies [e634fb6]
- Updated dependencies [577ae11]
- Updated dependencies [1641d30]
- Updated dependencies [8be0a32]
  - @coexist/core@0.3.0

## 0.2.1

### Patch Changes

- @coexist/core@0.2.1

## 0.2.0

### Minor Changes

- 09b158e: Add a localspace-backed cross-framework storage plugin with `StorageToken`, localspace driver/plugin re-exports, and a shared storage service for app DI.

### Patch Changes

- c91cebc: Allow plugins to contribute non-module providers, have the router plugin provide `RouterToken`, and flush storage writes through plugin context disposal.
- 289305a: Enforce strict actions for nested state, arrays, and direct store mutation APIs, add an app-level action boundary for controlled whole-store updates, and use it for storage hydration.
- e7c81ad: Add explicit provider auto-disposal ownership, keep external values and aliases unowned by default, let custom disposers replace convention disposal, and make storage destroyOnDispose authoritative.
- dbf42b0: Add a `throttleMs` option to both storage plugins: state-change persistence
  writes at most once per interval on the trailing edge, always with the latest
  state. Pending writes flush on plugin dispose or through `flush()`, while
  explicit `clear()` and `persist()` cancel stale scheduled writes. Without the
  option every state change is queued immediately, as before.
- Updated dependencies [c9e64c3]
- Updated dependencies [6aec125]
- Updated dependencies [c91cebc]
- Updated dependencies [51a2645]
- Updated dependencies [289305a]
- Updated dependencies [ee5301b]
- Updated dependencies [98b4aa2]
- Updated dependencies [26ce33f]
- Updated dependencies [5f71742]
- Updated dependencies [e7c81ad]
- Updated dependencies [159ffbe]
- Updated dependencies [95d00bb]
- Updated dependencies [0751a50]
- Updated dependencies [027171e]
- Updated dependencies [14e063c]
- Updated dependencies [f931e31]
- Updated dependencies [38f4014]
- Updated dependencies [77bddf0]
- Updated dependencies [a02235b]
- Updated dependencies [1abd56b]
- Updated dependencies [38b8aa3]
- Updated dependencies [80c4e58]
- Updated dependencies [e1336a0]
- Updated dependencies [e3c3fff]
- Updated dependencies [f9c4c3c]
- Updated dependencies [71e762e]
  - @coexist/core@0.2.0

## 0.1.0

### Major Changes

- Release Coexist 0.1 with the app runtime, lightweight DI, module decorators and no-decorator metadata, framework-native UI adapters, worker/shared runtime transports, persistence, router, devtools, testing helpers, examples, and CI/CD publishing support.

### Minor Changes

- 2f51753: Advance the Coexist runtime toward the v0.1 application model:

  - add explicit lazy modules with `lazyModule()` and `app.load()`
  - add async container construction through `buildAsync()`
  - run worker hosts through app startup before publishing the initial snapshot
  - expose a data-transport-compatible worker transport adapter
  - add module effects, cached computed getters, eager provider instantiation, and settled async action reporting
  - add router lifecycle bridging and queued storage persistence controls

- 527b664: Add `partialize` and `merge` options for partial persistence and hydrated state merging.

### Patch Changes

- Updated dependencies [11db34e]
- Updated dependencies [2e01e3a]
- Updated dependencies [5385bd5]
- Updated dependencies [2f51753]
- Updated dependencies [8d18a9a]
- Updated dependencies [366eb38]
- Updated dependencies [177ca9a]
- Updated dependencies [794566f]
- Updated dependencies [77cd9a9]
- Updated dependencies [80f25e8]
  - @coexist/core@0.1.0
