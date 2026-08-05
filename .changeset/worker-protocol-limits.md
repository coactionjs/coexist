---
"@coexist/core": minor
---

Bound what one worker peer can make the other allocate. Protocol messages were validated for shape but not for size, so well-formed traffic — an unbounded argument list, a message carrying millions of patches, a deeply nested patch path, or calls queued faster than the host answers — could spend the receiving endpoint's memory and CPU. `createWorkerApp` and `createWorkerClient` now accept `limits` with `maxCallArgs` (100), `maxPatchesPerMessage` (10000), `maxPatchPathDepth` (100), and `maxPendingCalls` (1000). An oversized call is answered with an error so the caller does not wait out its timeout; an oversized state message is dropped and reported through `onInvalidMessage`.
