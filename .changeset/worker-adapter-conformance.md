---
"@coexist/vue": patch
---

Cover the Vue worker helpers. `workerClientPlugin`, `useWorkerComputed`, and both missing-provider errors had no test, which left this adapter with the lowest branch coverage of the five while its app-side helpers were fully exercised. The shared adapter conformance contract now runs its worker half — mirrored state follows a remote action, a disposed scope stops mirroring, and a missing client raises rather than returning `undefined` — against all five adapters, and `@coexist/vue` gained the unit tests that were missing behind it.
