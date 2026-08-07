---
"@coexist/angular": patch
"@coexist/react": patch
"@coexist/solid": patch
"@coexist/svelte": patch
"@coexist/vue": patch
---

Verify the lower bound of every adapter's framework peer range. CI only ever exercised the newest version in each one, so `^18.3.0 || ^19.0.0` was tested at React 19 and `>=17.0.0 <23` at Angular 22 — the older half of each claim was backed by nothing. `test:frameworks:min-version` now builds a throwaway consumer per adapter outside the workspace (which `catalogMode: strict` and a single lockfile prevent from holding two versions of a framework), installs exactly the floor, asserts the resolver did not upgrade past it, and typechecks that entry point's export surface against it. All five adapters pass at Angular 17, React 18.3, Solid 1.9, Svelte 4, and Vue 3.5. `@coexist/svelte/runes` is checked separately at Svelte 5, because it imports `svelte/reactivity` and so needs more than the package range's floor — a stricter requirement that nothing verified before. Package floors are read from the manifests, so changing a peer range changes what is tested.
