---
"@coexist/core": minor
---

Type `defineModule()` metadata against the class it describes. The property lists were `readonly PropertyKey[]`, unrelated to the class, so `state: ["cout"]` compiled and then silently gave the instance a reactive property that read `undefined` and wrote into the store — a typo in the decorator-free path, which the docs recommend as the portable default, produced no error anywhere. `state` and `computed` now accept only `keyof` the instance type, `actions` and `effects` only its callable members, and `DefineModuleOptions` takes the instance type as a parameter (defaulting to the previous permissive shape for callers that build options without a class in hand). Metadata that already matched its class is unaffected; metadata that never did now fails to compile.
