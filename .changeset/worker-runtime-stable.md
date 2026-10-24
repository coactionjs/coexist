---
"@coexist/core": minor
---

The worker runtime is Stable. The host/client API, options, error semantics, and supported topology are covered by the `2.x` promise over trusted, reliable transports. The wire protocol remains internal and outside the compatibility promise; both endpoints must still use the same `@coexist/core` version. The Stable label itself changes no runtime code or API, so apps that adopted the beta worker in 2.0.0 need no migration for it. The worker fixes that ship in the same release are described in their own changesets.
