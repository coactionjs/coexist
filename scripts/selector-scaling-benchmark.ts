#!/usr/bin/env node
// A baseline for the cost of Coexist's single-publication design.
//
// The whole app store shares one Coaction publication signal, so every commit
// gives every selector a chance to re-run regardless of which module changed.
// That keeps cross-module actions atomic and adapters uniform, but the cost
// grows with selector count rather than with the size of the change. This
// script measures where that lands today so a change to the invalidation model
// can be argued from numbers instead of intuition.
//
// Run with `pnpm run bench`. It is deliberately not part of `check`: timings
// are machine-dependent and would make CI flaky.
import { createApp, defineModule, type App } from "../packages/core/src/index.ts";

const results = [];

measureModuleScaling(100);
measureModuleScaling(1_000);
measureModuleScaling(10_000);
measureSelectorFanout(100);
measureSelectorFanout(1_000);
measureSelectorFanout(10_000);
measureDeepMutation(6, 8);
measureWorkerPayloads(1_000);

console.table(results);

function record(scenario: string, unit: string, value: number, note = "") {
  results.push({
    scenario,
    [unit]: Number(value.toFixed(3)),
    note,
  });
}

function createModuleClass(index: number) {
  const ModuleClass = class {
    count = 0;

    increase() {
      this.count += 1;
    }
  };

  defineModule(ModuleClass, {
    actions: ["increase"],
    name: `benchModule${index}`,
    state: ["count"],
  });

  return ModuleClass;
}

/** How app creation and a single action scale with the number of modules. */
function measureModuleScaling(moduleCount: number) {
  const modules = Array.from({ length: moduleCount }, (_, index) => createModuleClass(index));
  const createdAt = performance.now();
  const app = createApp({ providers: modules });
  const created = performance.now() - createdAt;

  const first = app.getModule(modules[0]);
  const actionAt = performance.now();

  for (let index = 0; index < 1_000; index += 1) {
    first.increase();
  }

  const perAction = (performance.now() - actionAt) / 1_000;

  record(`create app (${moduleCount} modules)`, "ms", created);
  record(`action with ${moduleCount} modules`, "ms", perAction, "per action");

  void app.dispose();
}

/**
 * The scenario the single-publication signal is worst at: many selectors, one
 * changing module. Every selector re-runs; only one of them can change value.
 */
function measureSelectorFanout(selectorCount: number) {
  const Watched = createModuleClass(-1);
  const app = createApp({ providers: [Watched] });
  const watched = app.getModule(Watched);
  let notifications = 0;
  const stops = [];

  for (let index = 0; index < selectorCount; index += 1) {
    // Only the first selector reads the value that actually changes; the rest
    // are pure overhead the current invalidation model cannot avoid.
    const read = index === 0 ? () => watched.count : () => index;
    stops.push(
      app.watch(read, () => {
        notifications += 1;
      }),
    );
  }

  const startedAt = performance.now();

  for (let index = 0; index < 100; index += 1) {
    watched.increase();
  }

  const perAction = (performance.now() - startedAt) / 100;

  for (const stop of stops) {
    stop();
  }

  record(
    `action with ${selectorCount} selectors`,
    "ms",
    perAction,
    `${notifications} listener call(s) for 100 actions`,
  );

  void app.dispose();
}

/** Cost of writing deep inside a module's state tree. */
function measureDeepMutation(depth: number, breadth: number) {
  const DeepModule = class {
    tree = buildTree(depth, breadth);

    touch() {
      let node = this.tree;

      for (let level = 0; level < depth; level += 1) {
        node = node.children[0];
      }

      node.value += 1;
    }
  };

  defineModule(DeepModule, {
    actions: ["touch"],
    name: "benchDeepModule",
    state: ["tree"],
  });

  const app = createApp({ providers: [DeepModule] });
  const module = app.getModule(DeepModule);
  const startedAt = performance.now();

  for (let index = 0; index < 100; index += 1) {
    module.touch();
  }

  record(
    `deep mutation (depth ${depth}, breadth ${breadth})`,
    "ms",
    (performance.now() - startedAt) / 100,
    "per action",
  );

  void app.dispose();
}

function buildTree(depth: number, breadth: number) {
  if (depth === 0) {
    return { children: [], value: 0 };
  }

  return {
    children: Array.from({ length: breadth }, () => buildTree(depth - 1, breadth)),
    value: 0,
  };
}

/**
 * What a worker client pays per update in each sync mode. A snapshot carries
 * the whole published state; a patch carries only the change.
 */
function measureWorkerPayloads(itemCount: number) {
  const ListModule = class {
    items = Array.from({ length: itemCount }, (_, index) => ({
      id: index,
      label: `item ${index}`,
    }));

    rename(index: number) {
      this.items[index] = { ...this.items[index], label: `renamed ${index}` };
    }
  };

  defineModule(ListModule, {
    actions: ["rename"],
    name: "benchListModule",
    state: ["items"],
  });

  const app: App = createApp({
    engine: { patches: true },
    plugins: [
      {
        name: "bench:patch-size",
        onPatch(event) {
          record(
            `worker patch payload (${itemCount} items)`,
            "bytes",
            JSON.stringify(event.patches).length,
          );
        },
      },
    ],
    providers: [ListModule],
  });

  record(
    `worker snapshot payload (${itemCount} items)`,
    "bytes",
    JSON.stringify(app.store.getPureState()).length,
  );
  app.getModule(ListModule).rename(0);

  void app.dispose();
}
