---
"@coexist/core": patch
"@coexist/create": patch
"@coexist/router": patch
"@coexist/storage": patch
---

Cover the paths that had none, and raise the floors so they stay covered. The collaborators split out of `RuntimeApp` shipped with the thinnest tests in the repo — `moduleRegistry` and `effectRuntime` sat at 50% and 71% branch coverage — and several long-standing files were no better: `token` at 47%, `decorators` at 56%, `async-context` at 50%, the scaffold CLI at 25%, the router at 72%, and a third of the storage service surface never called. The gaps were all error handling and fallbacks: duplicate-module detection, a disposer that throws mid-teardown, staged-rollback baselines, decorator target guards, every runtime without `node:async_hooks`, the CLI's failure and `--force` paths, `createBrowserRouter` without a window, a terminal error observer that itself rejects, and each storage delegation. Those files now sit at 94–100%, the repository floors move from 85/78/88 to 89/83/92, and the extracted collaborators carry a floor of their own.
