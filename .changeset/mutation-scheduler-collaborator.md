---
"@coexist/core": patch
---

Split the mutation scheduler out of `RuntimeApp`, with no behaviour change. Deferring a write made while the store is already committing depended on four fields — two depth counters, a queue, and a reentrancy flag — touched from seven methods, and reading any one without the others could not tell you whether a write was safe. `MutationScheduler` now owns that rule as one object's invariant: when to queue, how a failed commit discards what it had scheduled, how notification defers listener writes, and how a self-triggering cascade is capped rather than allowed to spin. `RuntimeApp` is down to 28 fields.
