---
"@coexist/storage": patch
---

Make `StoragePlugin.ready()` wait for hydration it can actually observe. Both plugins started from an already-resolved promise and only replaced it inside `setup()`, but `createApp()` schedules plugin setup on a later microtask — so the documented `const plugin = createStoragePlugin(...); createApp({ plugins: [plugin] }); await plugin.ready();` sequence resolved before hydration had begun, and callers read pre-hydration state. `ready()` is now backed by a deferred promise created with the plugin and settled when hydration finishes or fails; it also rejects when the app tears down without ever running the plugin's setup. The imperative write methods still work on a plugin that was never installed.
