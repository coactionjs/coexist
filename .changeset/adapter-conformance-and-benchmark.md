---
"@coexist/core": patch
---

Hold every UI adapter to one shared behaviour contract, and add a scaling benchmark. The five adapters share no implementation, so each could drift from the others unnoticed — a real bug where the Svelte worker client shadowed component context showed how. `packages/integration/src/adapterConformance.ts` now runs one spec against React, Vue, Svelte, Solid, and Angular: the resolved module is the facade the app owns, a selector starts from the current value and follows later actions, two apps observed at once stay isolated, a disposed scope stops following the app, and a missing app raises an error rather than returning `undefined`. `pnpm run bench` measures what the single-publication invalidation model costs as selectors, modules, and state depth grow, and how snapshot and patch worker payloads compare — the baseline any change to that model should be argued against.
