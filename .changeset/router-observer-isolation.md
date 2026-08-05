---
"@coexist/router": patch
---

Stop router observers from breaking navigation. A throwing `onError` escaped `router.navigate()` on the synchronous path and produced an unhandled rejection on the async one, and a single throwing subscriber aborted the notification loop so every later subscriber kept rendering a stale location. `onError` is now a terminal observer whose own failures are swallowed, and subscriber failures are reported through a new `onError` on `createMemoryRouter` / `createBrowserRouter` while the remaining subscribers are still notified — matching how core, worker, and devtools already isolate observers from the main flow.
