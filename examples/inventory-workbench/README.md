# Inventory workbench

This example shows one `InventoryBoard` business module rendered by React and Vue at the same time. Changing an item in either view updates the other. The module gets a catalog API and a planner through explicit DI; the UI does not implement inventory rules.

Run it from the repository root:

```sh
pnpm install
pnpm --filter @coexist/example-inventory-workbench dev
```

The catalog is an asynchronous, replaceable seed service. **Simulate outage** exercises the error state; **Retry catalog** uses the same module method as startup. `domain.test.ts` overrides this provider without mounting a UI.

`PlanningModule` runs in a dedicated Worker. The client imports its TypeScript type from the same source file and calls it through `WorkerClient.module<PlanningModule>()`; calls are asynchronous and the Worker returns the reorder suggestions. The app's planner plugin releases the client and terminates the Worker during `app.dispose()`.

The storage plugin saves stock overrides to IndexedDB. Reloading the page hydrates them before the catalog's `onInit` load. Only overrides are persisted, so catalog data and Worker results are recalculated on each visit. The browser smoke checks React-to-Vue updates, Worker results, reload persistence, and error recovery.
