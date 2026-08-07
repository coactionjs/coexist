---
"@coexist/core": patch
---

Record every package's public API in a committed report and verify it in CI. A version number says a release is breaking but not what broke: a removed export, a parameter that became required, or a widened return type all shipped with nothing drawing a reviewer's eye to them, because the only evidence was inside the diff of the implementation. `api-report/` now holds one file per published package, generated from the built declarations, re-printed through the TypeScript printer and sorted by name so it moves only when the API moves. `test:api-report` fails the build when the built surface drifts from the committed report, and `pnpm run api-report:update` accepts an intended change — which is the point at which the changeset should say so.
