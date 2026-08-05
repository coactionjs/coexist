---
"@coexist/core": minor
---

Recover a worker client mirror that fell behind its host. `missing-snapshot`, `version-gap`, and `patch-apply-failed` were only reported through `onConflict`, and the internal snapshot sync only ran when an RPC result advertised a newer state version — so a client that just watches state stayed on its stale snapshot forever, with every later patch producing another gap. Those three conflicts now start a single-flight snapshot request with debounce, capped exponential backoff, per-attempt timeout, and a bounded attempt count. `client.state.status` exposes `synced` / `recovering` / `failed`, `onResync` reports each transition, and `resync: false` keeps the previous report-only behaviour.
