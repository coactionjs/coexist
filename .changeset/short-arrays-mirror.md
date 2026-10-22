---
"@coexist/core": patch
---

Apply the `length` patches Coaction emits when an action shrinks an array (`pop()`, `splice()`, or a `length` assignment) on patch-synced worker clients, instead of reporting `patch-apply-failed` and resyncing a snapshot. Length patches that would grow an array, or use any operation but `replace`, are still rejected.
