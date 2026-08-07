---
"@coexist/angular": patch
"@coexist/core": patch
"@coexist/create": patch
"@coexist/devtools": patch
"@coexist/react": patch
"@coexist/router": patch
"@coexist/solid": patch
"@coexist/storage": patch
"@coexist/svelte": patch
"@coexist/testing": patch
"@coexist/vue": patch
---

Declare `engines.node` on every published package. The documentation said the Node floor was `>=22.12.0`, "matching the `engines` field" — but only the private workspace root carried one, so nothing reached a consumer: installing on Node 20 produced no warning, and the first sign of trouble was a syntax or API error at runtime. Each package now declares `>=22.12.0` itself, which is the version CI has been testing against all along. If you install on an older Node your package manager will now say so; with `engine-strict` it will refuse, which is the intent.

The peer-range table and Node floor in `docs/scope-and-stability.md` are also checked against the manifests now (`test:docs-versions`). That page opens by saying it is updated with the code rather than aspirationally, and those two claims were hand-copied numbers that nothing verified.
