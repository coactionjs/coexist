---
"@coexist/core": minor
---

Stop discarding container cleanup when `createApp()` fails. The rollback path fired `container.dispose()` and swallowed the result, so an async provider disposer was still running when the caller received the error and its failure vanished entirely — a failed creation could leave a connection or handle open with no way to find out. The thrown error now carries that disposal promise: `getAppCreationCleanup(error)` returns it, resolving once creation's resources are released and rejecting with whatever release failed on. The rejection stays internally observed, so ignoring it is still safe.
