---
"@coexist/core": patch
---

A worker client that refuses a host for speaking another protocol revision now reports `client.state.status` as `failed`, and a recovery run that was in progress ends with an `onResync` event whose status is `failed` and whose error is the `WorkerProtocolMismatchError`. Previously the status stayed `synced`, or `recovering` forever, so a view that watched only the status never learned that the client had stopped mirroring.
