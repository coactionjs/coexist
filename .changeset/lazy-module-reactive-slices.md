---
"@coexist/core": patch
---

Keep lazily loaded module slices reactive after their state is committed. Previously a lazy module stayed detached for its whole lifetime, so its `@Effect` methods ran once and never reran, and its `@Computed` getters recomputed on every read instead of caching. Both now behave the same as eagerly registered modules.
