---
"@coexist/angular": minor
"@coexist/devtools": minor
"@coexist/react": minor
"@coexist/router": minor
"@coexist/solid": minor
"@coexist/storage": minor
"@coexist/svelte": minor
"@coexist/testing": minor
"@coexist/vue": minor
---

Declare `@coexist/core` as a peer dependency instead of an ordinary one. Each adapter and plugin pinned core exactly, so an app on a different core version got a second copy installed under the adapter: `instanceof CoexistError` stopped working across that boundary, two runtimes disagreed on protocol and lifecycle assumptions, and bundles carried the runtime twice. Core is now `peerDependencies: { "@coexist/core": "^<version>" }` plus a workspace devDependency, so one runtime is shared. Installs that already list `@coexist/core` alongside the adapter — as every README instructs — need no change. The pack smoke now fails if a package regresses to depending on core directly.
