---
"@coexist/svelte": patch
---

Resolve the Svelte worker client from component context before the module-global default, matching `getCoexistApp()`. `setWorkerClientContext(client)` was previously ignored whenever `setWorkerClient()` had been called, which let a module-level client shadow per-request (SSR) and nested clients.
