---
"@coexist/core": patch
"@coexist/create": patch
---

Close three gaps found reviewing the worker and scaffold changes. A sync request that resumed after the host store became unreadable escaped as an unhandled rejection, because the publish moved outside the handler's `try` when the delivery contract landed but the caller cannot await it — it is reported through `onDeliveryError` again. An initial snapshot that failed delivery asynchronously neither reached `onDeliveryError` nor forced the next update to be a full snapshot, unlike a synchronous failure. And `createCoexistProject()` stopped creating missing parent directories when it began staging files in a sibling directory, so `create-coexist apps/web` failed with a raw `ENOENT` unless `apps` already existed.
