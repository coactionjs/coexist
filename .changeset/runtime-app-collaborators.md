---
"@coexist/core": patch
---

Split three collaborators out of `RuntimeApp`, with no behaviour change. Lifecycle state lived in five booleans and four promise fields (`isInitialized`, `isStarted`, `shouldBeStarted`, `isDisposing`, `isDisposed`, plus the init/start/stop/transition promises) read and written from a dozen methods, so nothing prevented a combination that cannot occur and every new branch re-derived which combinations were legal. Effect disposers and in-flight async runs, and the module list with its two indexes, were spread the same way — a lazy-module rollback had to update several of them consistently by hand. `AppLifecycleController` now owns the lifecycle machine behind a named `phase`, `EffectRuntime` owns effect tracking and teardown, and `ModuleRegistry` owns the ordered module list with its token and name indexes. `RuntimeApp` keeps the action/mutation/publication machinery and the lazy-module loader for now.
