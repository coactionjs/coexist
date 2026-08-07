---
"@coexist/vue": minor
---

Give `useSelector` / `useComputed` the module-token form the other adapters have. React, Solid, and Angular all accept `(token, selector)` alongside `(selector)`; Vue only accepted the app form, so Vue users had to write `useComputed((app) => app.getModule(Counter).count)` where everyone else writes `useSelector(Counter, (m) => m.count)` — pushing them back to exactly the shape adapters exist to remove. Both composables now accept both forms. The adapter conformance contract requires the token form from every adapter, so this cannot drift again.
