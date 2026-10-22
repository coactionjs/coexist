---
"@coexist/storage": minor
---

Add `StorageService.close()`, which releases the localspace instance's plugins and driver without deleting stored data, and have `destroyOnDispose` call it, falling back to `destroy()` for services that do not implement it. Deprecate `syncPlugin`, `quotaPlugin`, `StorageService.destroy()`, and `StorageService.getPerformanceStats()`, which localspace 3 no longer provides.
