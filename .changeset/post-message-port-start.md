---
"@coexist/core": patch
---

`createPostMessageWorkerTransport` now starts a `MessagePort` when it subscribes. It listens with `addEventListener`, which, unlike assigning `onmessage`, leaves a browser port's queue disabled, so a host or client on either end of a `MessageChannel` — or on a `SharedWorker` port — never received a message and `client.ready` timed out. Only real ports are started; on a window the transport does not call a global function that happens to be named `start`.
