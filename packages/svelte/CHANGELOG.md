# @coexist/svelte

## 1.0.0

### Minor Changes

- a2e8b0e: Declare `@coexist/core` as a peer dependency instead of an ordinary one. Each adapter and plugin pinned core exactly, so an app on a different core version got a second copy installed under the adapter: `instanceof CoexistError` stopped working across that boundary, two runtimes disagreed on protocol and lifecycle assumptions, and bundles carried the runtime twice. Core is now `peerDependencies: { "@coexist/core": "^<version>" }` plus a workspace devDependency, so one runtime is shared. Installs that already list `@coexist/core` alongside the adapter — as every README instructs — need no change. The pack smoke now fails if a package regresses to depending on core directly.
- fix

### Patch Changes

- 9127b56: Bound the React and Svelte peer ranges to the majors these adapters are tested against. `">=18.3.0 || >=19.0.0"` and `">=4.0.0 || >=5.0.0"` each collapse to their lower bound, so the packages silently claimed compatibility with React 20+ and Svelte 6+ — unlike the Angular, Vue, and Solid adapters, which all cap their ranges. They are now `"^18.3.0 || ^19.0.0"` and `"^4.0.0 || ^5.0.0"`.
- 115fb51: Declare `engines.node` on every published package. The documentation said the Node floor was `>=22.12.0`, "matching the `engines` field" — but only the private workspace root carried one, so nothing reached a consumer: installing on Node 20 produced no warning, and the first sign of trouble was a syntax or API error at runtime. Each package now declares `>=22.12.0` itself, which is the version CI has been testing against all along. If you install on an older Node your package manager will now say so; with `engine-strict` it will refuse, which is the intent.

  The peer-range table and Node floor in `docs/scope-and-stability.md` are also checked against the manifests now (`test:docs-versions`). That page opens by saying it is updated with the code rather than aspirationally, and those two claims were hand-copied numbers that nothing verified.

- 212c277: Verify the lower bound of every adapter's framework peer range. CI only ever exercised the newest version in each one, so `^18.3.0 || ^19.0.0` was tested at React 19 and `>=17.0.0 <23` at Angular 22 — the older half of each claim was backed by nothing. `test:frameworks:min-version` now builds a throwaway consumer per adapter outside the workspace (which `catalogMode: strict` and a single lockfile prevent from holding two versions of a framework), installs exactly the floor, asserts the resolver did not upgrade past it, then typechecks _and imports_ that entry point against it. All five adapters pass at Angular 17, React 18.3, Solid 1.9, Svelte 4, and Vue 3.5. Package floors are read from the manifests, so changing a peer range changes what is tested.

  Importing is what makes the check real, and it immediately found a wrong claim. A framework import survives into an adapter's JavaScript but is erased from its declarations unless a public signature mentions it — `runes.js` imports `svelte/reactivity`, `runes.d.ts` does not — so a typecheck-only run passes at any floor. `@coexist/svelte/runes` was documented as needing Svelte 5; it actually needs **5.7.0**, the release that added the `createSubscriber` it is built on. On Svelte 5.0–5.6 that subpath throws `does not provide an export named 'createSubscriber'` on import. The peer range is unchanged — it covers the store API at the package root, which still runs on Svelte 4 — and the subpath's real floor is now documented in the package README and verified.

- 9847694: Resolve the Svelte worker client from component context before the module-global default, matching `getCoexistApp()`. `setWorkerClientContext(client)` was previously ignored whenever `setWorkerClient()` had been called, which let a module-level client shadow per-request (SSR) and nested clients.
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

### Patch Changes

- 4475394: `getCoexistApp` now resolves the component context before the global default
  app, so nested apps and per-request (SSR) apps are not shadowed by
  module-level state. The global app set with `setCoexistApp` remains the
  fallback outside component context.
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

- 8864bec: Add the `@coexist/svelte/runes` subpath with Svelte 5 friendly `moduleRune`, `selectorRune`, and `selectedModuleRune` helpers.
- 696306b: Add Svelte store and rune helpers for worker-hosted modules with `setWorkerClient`, `workerModuleStore`, `workerSelectorStore`, `workerModuleRune`, and `workerSelectorRune`.

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
