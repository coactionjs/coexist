---
"@coexist/core": patch
---

Bound the pending call/sync routes a broadcast worker transport retains, and stop posting replies whose route is missing. A peer that never answered — a disposed host, or a sync request whose app failed to start — previously kept its route forever, and an unroutable reply was broadcast with an internal routing id that could settle an unrelated pending call on another peer. Such replies are now reported through `onError` instead.
