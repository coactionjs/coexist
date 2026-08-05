---
"@coexist/core": minor
---

Give `WorkerTransport.post()` a delivery contract. It now returns `void | Promise<void>` and must throw or reject when a message cannot be delivered. The client already assumed this — it failed a call when `post()` threw — but every built-in adapter swallowed the failure into `onError`, so a synchronous failure only surfaced after the 30-second request timeout, an asynchronous one never correlated with its call at all, and the host advanced its published state version for a snapshot that never arrived and then kept sending patches on top of it. The postMessage, broadcast, and data-transport adapters now propagate failures after reporting them, the client fails calls and sync requests on both synchronous and asynchronous delivery errors, `host.ready` rejects when the initial snapshot cannot be published, and a failed state publish makes the next update a full snapshot. Hosts observe delivery failures with `createWorkerApp({ onDeliveryError })`.
