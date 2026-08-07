---
"@coexist/core": minor
---

Version the worker wire protocol. Both endpoints were already required to come from the same `@coexist/core` version, but nothing checked: a mismatched pair connected happily and then misread each other's frames as corrupted state, missing methods, or silent staleness. The host now stamps `workerProtocolVersion` on its `ready` handshake, and a client seeing a different revision rejects `client.ready` with `WorkerProtocolMismatchError` instead of mirroring what it cannot parse. A handshake carrying no version predates this and is still accepted, so an older host keeps working.
