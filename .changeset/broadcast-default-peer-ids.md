---
"@coexist/core": patch
---

`createBroadcastWorkerTransport` no longer gives the first transport of every tab the same default `peerId`. The default came from a per-module counter, so a host tab and a client tab that both omitted `peerId` were each `peer:1`, dropped each other's messages as their own echo, and `client.ready` timed out. Default ids now combine a per-realm random part with that counter. Explicit `peerId` values are unchanged.
