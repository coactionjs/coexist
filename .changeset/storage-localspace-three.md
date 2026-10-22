---
"@coexist/storage": major
---

Run `@coexist/storage` on localspace 3.0.1, which carries localspace's encryption fixes: encrypted stores fail closed and reject plaintext values injected into storage.

Breaking changes:

- `syncPlugin` and `quotaPlugin` are no longer exported; localspace 2 removed them.
- `StorageService.destroy()` is replaced by `close()`, which releases plugins and the driver and keeps stored data, and `StorageService.getPerformanceStats()` is removed. A custom `StorageService` must implement `close()`.
- `StorageService.set()`, `setMany()` and `StorageTransactionScope.set()` accept plain data only, typed through localspace's `StorageValueInput`. Persisted app state containing a `Date`, `Map`, `Set` or class instance is rejected and reported to `onError` in the `"persist"` phase.
- `encryptionPlugin()` rejects stored values that are not encrypted payloads, so state persisted before encryption was enabled fails hydration until it is rewritten through `encryptionPlugin({ key, allowPlaintext: true })`, and it accepts AES-GCM only.
- `transaction()` follows localspace 3: it is available on IndexedDB and memory drivers only, an overlapping transaction on the same instance rejects, and `StorageTransactionScope.iterate()` awaits async callbacks and resolves to `U | undefined`.

See "Migrating from 1.x" in the package README.
