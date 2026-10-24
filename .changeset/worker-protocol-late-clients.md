---
"@coexist/core": patch
---

A worker client now refuses a host that speaks another protocol revision even when it attached after the host's `ready` announcement, and it stays refused. The host stamps `workerProtocolVersion` on every frame that carries the full state as well as on `ready`, so a late client checks the revision before it adopts any state; patch-only frames are unchanged. After a mismatch the client applies none of that host's snapshots or results: `client.ready`, pending calls, and later calls reject with `WorkerProtocolMismatchError`. Previously only the `ready` frame was checked, and a client that missed it, or that had rejected `ready`, still mirrored the host's frames.
