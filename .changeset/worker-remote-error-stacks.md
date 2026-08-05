---
"@coexist/core": minor
---

Stop sending remote error stacks to worker clients by default. A failed remote call serialized `error.stack` unconditionally, so every rejection handed the peer local file paths, the source directory layout, internal function names, and build structure — across iframes, sockets, and processes as readily as across a same-origin Worker. Errors now cross as `{ name, message }`; opt stacks back in for a trusted channel with `createWorkerApp({ includeErrorStack: true })`, or replace the payload entirely with `serializeError`. The host still sees the complete error through its own error reporting.
