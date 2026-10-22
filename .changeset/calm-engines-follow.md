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

Upgrade the Coexist engine to Coaction 4.1.0, which builds on Mutative 2. Public Coexist APIs are unchanged. Patch pairs published to `onPatch` plugins, devtools, and worker patch sync follow Mutative 2's order: a nested value's patches come before its parent's, and a moved draft travels with its parent's patches. Replaying a pair in order reaches the same state as before. Production builds of Mutative throw `Minified Mutative error #<code>`, so bundles must define `process.env.NODE_ENV`.
