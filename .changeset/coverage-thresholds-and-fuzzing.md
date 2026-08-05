---
"@coexist/core": patch
---

Add seeded fuzz coverage for the worker protocol and the app lifecycle, and enforce coverage floors. Coverage was measured but never gated, and `passWithNoTests` meant a package whose tests all vanished still reported success — so both the number and the reach of the tests could quietly shrink. `test:coverage` is now part of `check` and CI with global thresholds plus a higher bar for `packages/core/src/**`, a project with no tests fails, and two seeded suites assert invariants over input spaces too large to enumerate by hand: arbitrary protocol messages and patch paths (no throw escapes, the mirror keeps a clean prototype, `Object.prototype` stays unpolluted, a rejected patch never mutates the snapshot) and interleaved `start`/`stop`/`ready`/`dispose` sequences (hooks stay balanced, disposal is terminal, no unhandled rejections).
