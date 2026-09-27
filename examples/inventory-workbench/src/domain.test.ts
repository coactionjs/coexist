import { afterEach, describe, expect, it } from "vitest";

import { provide, testApp, type TestApp } from "@coexist/core";
import { memoryDriver } from "@coexist/storage";

import {
  CatalogGateway,
  InventoryBoard,
  PlanningGateway,
  type ReorderSuggestion,
  type StockItem,
} from "./domain";
import { createWorkbench } from "./workbench";

const sample: StockItem = {
  id: "filters",
  name: "Water filters",
  available: 18,
  dailyDemand: 5,
  leadDays: 7,
};

let app: TestApp | undefined;

afterEach(async () => {
  await app?.dispose();
  app = undefined;
});

describe("inventory workbench", () => {
  it("loads through an override and sends edited stock to the planner", async () => {
    const planned: StockItem[][] = [];
    const planner: PlanningGateway = {
      async plan(items): Promise<ReorderSuggestion[]> {
        planned.push(items.map((item) => ({ ...item })));
        return items.map((item) => ({ id: item.id, target: 46, order: 46 - item.available }));
      },
    };
    const catalog: CatalogGateway = {
      async list() {
        return [{ ...sample }];
      },
    };

    app = testApp({
      providers: [
        InventoryBoard,
        provide(CatalogGateway, {
          useValue: {
            async list() {
              throw new Error("unreplaced");
            },
          },
        }),
        provide(PlanningGateway, { useValue: planner }),
      ],
      overrides: [provide(CatalogGateway, { useValue: catalog })],
      strictActions: true,
    });

    await app.ready;
    const board = app.getModule(InventoryBoard);
    expect(board.status).toBe("ready");
    expect(board.suggestion("filters")?.order).toBe(28);

    await board.setAvailable("filters", 23);

    expect(board.available(sample)).toBe(23);
    expect(board.suggestion("filters")?.order).toBe(23);
    expect(planned.map((items) => items[0]?.available)).toEqual([18, 23]);
  });

  it("shows a catalog error and succeeds after retry", async () => {
    let fail = true;
    const catalog: CatalogGateway = {
      async list() {
        if (fail) {
          throw new Error("Catalog temporarily unavailable");
        }

        return [{ ...sample }];
      },
    };
    const planner: PlanningGateway = {
      async plan() {
        return [];
      },
    };

    app = testApp({
      providers: [
        InventoryBoard,
        provide(CatalogGateway, { useValue: catalog }),
        provide(PlanningGateway, { useValue: planner }),
      ],
      strictActions: true,
    });

    await app.ready;
    const board = app.getModule(InventoryBoard);
    expect(board.status).toBe("error");
    expect(board.error).toBe("Catalog temporarily unavailable");

    fail = false;
    await board.refresh();

    expect(board.status).toBe("ready");
    expect(board.items).toEqual([sample]);
  });

  it("releases the planner with the app", async () => {
    let disposals = 0;
    const { app: workbench, storage } = createWorkbench({
      catalog: {
        async list() {
          return [{ ...sample }];
        },
      },
      planner: {
        async plan() {
          return [];
        },
      },
      disposePlanner() {
        disposals += 1;
      },
      // oxlint-disable-next-line no-underscore-dangle -- LocalSpace exposes the registered driver name under _driver.
      storageDriver: memoryDriver._driver,
      storageName: "coexist-inventory-workbench-test",
    });

    await workbench.ready;
    await workbench.getModule(InventoryBoard).setAvailable("filters", 23);
    await storage.flush();
    await workbench.dispose();
    await workbench.dispose();

    expect(disposals).toBe(1);
  });
});
