---
"@coexist/create": minor
---

Stop the scaffold from clobbering directories and generating unreproducible projects. `createCoexistProject()` wrote `package.json`, `tsconfig.json`, and `src/main.ts` unconditionally, so pointing the CLI at an existing project silently destroyed its manifest, and it pinned `@coexist/core`, `tsx`, and `typescript` to `latest`, so the same CLI build produced a different — eventually incompatible — project every run. A non-empty target is now refused unless `--force` / `force: true` is passed, the project name is validated against npm's rules first, files are staged in a temporary directory and moved into place so a failed run leaves nothing behind, and dependencies are pinned to the ranges the scaffold is tested against (`@coexist/core` tracking this CLI's own version).
