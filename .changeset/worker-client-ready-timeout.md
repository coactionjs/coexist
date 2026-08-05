---
"@coexist/core": minor
---

Bound `WorkerClient.ready`. It previously settled only on the first state snapshot or on disposal, so a host that never started, a dropped snapshot, a client that attached too late, or a transport that silently discarded messages left `await client.ready` pending forever — and the documented "wait for ready before rendering" pattern turned that into a stalled app. Clients now request their own initial snapshot (`requestInitialSync`, default on) and re-request one whenever the host announces `ready`, reject after `readyTimeout` (default 30s, `0` waits forever) with `WorkerReadyTimeoutError`, reject on an aborted `signal` with `WorkerHostUnavailableError`, and reject with `WorkerInitialSyncError` when the request cannot be posted. A settled-by-failure `ready` no longer disables the client: a later snapshot is still applied.
