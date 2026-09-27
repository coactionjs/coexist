---
"@coexist/core": minor
---

Add `@coexist/core/local` for apps that keep state in one JavaScript realm. Its `createApp` uses Coaction's local store and excludes the shared transport runtime from the consumer bundle. The default entry remains the shared store entry for transport users.
