---
"@coexist/core": minor
---

Preserve the `1.0` effect contract across the Coaction 4 upgrade: effects re-run after every app commit by default. Applications that want Coaction 4's state-path effect tracking can opt in with `engine.effectInvalidation: "path"`.
