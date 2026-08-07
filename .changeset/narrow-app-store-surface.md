---
"@coexist/core": minor
---

Narrow what `App.store` promises. It was typed as the underlying Coaction `Store` in full, which put an external package's entire type — `destroy()`, `getInitialState()`, `name`, `share`, `transport`, `patch`, `trace` — inside Coexist's own contract, made any Coaction change a potential Coexist change, and let application code destroy the store the runtime owns and disposes. `App.store` is now an `AppStore`: `getPureState`, `getState`, `setState`, `apply`, and `subscribe`, with unchanged signatures. Every documented use keeps working; code reaching for the removed members no longer compiles. `AppStore` and `AppRootState` are exported.
