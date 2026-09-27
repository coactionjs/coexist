import { createApp, provide } from "@coexist/core";
import {
  createLocalSpaceStoragePlugin,
  indexedDBDriver,
  type LocalSpaceStoragePlugin,
} from "@coexist/storage";

import { CatalogGateway, InventoryBoard, PlanningGateway, type StockItem } from "./domain";

interface PersistedInventory {
  readonly inventory: { readonly overrides: Record<string, number> };
}

interface InventoryState extends PersistedInventory {
  readonly inventory: PersistedInventory["inventory"] & {
    readonly items: readonly StockItem[];
    readonly suggestions: readonly unknown[];
    readonly status: string;
    readonly error: string;
  };
}

export function createWorkbench(options: {
  readonly catalog: CatalogGateway;
  readonly planner: PlanningGateway;
  readonly disposePlanner: () => void;
  readonly storageDriver?: string;
  readonly storageName?: string;
}): {
  readonly app: ReturnType<typeof createApp>;
  readonly storage: LocalSpaceStoragePlugin;
} {
  const storage = createLocalSpaceStoragePlugin<PersistedInventory>({
    key: "inventory:overrides:v1",
    options: {
      name: options.storageName ?? "coexist-inventory-workbench",
      storeName: "inventory",
      // oxlint-disable-next-line no-underscore-dangle -- LocalSpace exposes the registered driver name under _driver.
      driver: options.storageDriver ?? indexedDBDriver._driver,
    },
    partialize: (state) => ({
      inventory: { overrides: (state as InventoryState).inventory.overrides },
    }),
    merge: (persisted, current) => ({
      ...(current as InventoryState),
      inventory: {
        ...(current as InventoryState).inventory,
        overrides: persisted.inventory.overrides,
      },
    }),
  });

  try {
    const app = createApp({
      devOptions: { strictActions: true },
      plugins: [
        storage,
        {
          name: "workbench:planner",
          dispose: options.disposePlanner,
        },
      ],
      providers: [
        InventoryBoard,
        provide(CatalogGateway, { useValue: options.catalog }),
        provide(PlanningGateway, { useValue: options.planner }),
      ],
    });

    return { app, storage };
  } catch (error) {
    options.disposePlanner();
    throw error;
  }
}
