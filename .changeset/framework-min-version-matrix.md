---
"@coexist/angular": patch
"@coexist/react": patch
"@coexist/solid": patch
"@coexist/svelte": patch
"@coexist/vue": patch
---

Verify the lower bound of every adapter's framework peer range. CI only ever exercised the newest version in each one, so `^18.3.0 || ^19.0.0` was tested at React 19 and `>=17.0.0 <23` at Angular 22 — the older half of each claim was backed by nothing. `test:frameworks:min-version` now builds a throwaway consumer per adapter outside the workspace (which `catalogMode: strict` and a single lockfile prevent from holding two versions of a framework), installs exactly the floor, asserts the resolver did not upgrade past it, then typechecks _and imports_ that entry point against it. All five adapters pass at Angular 17, React 18.3, Solid 1.9, Svelte 4, and Vue 3.5. Package floors are read from the manifests, so changing a peer range changes what is tested.

Importing is what makes the check real, and it immediately found a wrong claim. A framework import survives into an adapter's JavaScript but is erased from its declarations unless a public signature mentions it — `runes.js` imports `svelte/reactivity`, `runes.d.ts` does not — so a typecheck-only run passes at any floor. `@coexist/svelte/runes` was documented as needing Svelte 5; it actually needs **5.7.0**, the release that added the `createSubscriber` it is built on. On Svelte 5.0–5.6 that subpath throws `does not provide an export named 'createSubscriber'` on import. The peer range is unchanged — it covers the store API at the package root, which still runs on Svelte 4 — and the subpath's real floor is now documented in the package README and verified.
