import { defineModule, runInAction } from "@coexist/core";

export interface StockItem {
  readonly id: string;
  readonly name: string;
  readonly available: number;
  readonly dailyDemand: number;
  readonly leadDays: number;
}

export interface ReorderSuggestion {
  readonly id: string;
  readonly target: number;
  readonly order: number;
}

export abstract class CatalogGateway {
  abstract list(): Promise<StockItem[]>;
}

export abstract class PlanningGateway {
  abstract plan(items: readonly StockItem[]): Promise<ReorderSuggestion[]>;
}

export class InventoryBoard {
  items: StockItem[] = [];
  overrides: Record<string, number> = {};
  suggestions: ReorderSuggestion[] = [];
  status: "idle" | "loading" | "ready" | "error" = "idle";
  error = "";
  #loadRevision = 0;
  #planRevision = 0;
  #closed = false;

  constructor(
    private readonly catalog: CatalogGateway,
    private readonly planner: PlanningGateway,
  ) {}

  async onInit(): Promise<void> {
    await this.refresh();
  }

  onDispose(): void {
    this.#closed = true;
    this.#loadRevision += 1;
    this.#planRevision += 1;
  }

  async refresh(): Promise<void> {
    const revision = ++this.#loadRevision;
    runInAction(this, () => {
      this.status = "loading";
      this.error = "";
    });

    try {
      const items = await this.catalog.list();

      if (this.#closed || revision !== this.#loadRevision) {
        return;
      }

      runInAction(this, () => {
        this.items = items;
        this.status = "ready";
      });
      await this.recalculate();
    } catch (error) {
      if (this.#closed || revision !== this.#loadRevision) {
        return;
      }

      runInAction(this, () => {
        this.status = "error";
        this.error = error instanceof Error ? error.message : String(error);
      });
    }
  }

  async setAvailable(id: string, value: number): Promise<void> {
    if (!this.items.some((item) => item.id === id)) {
      throw new Error(`Unknown stock item: ${id}`);
    }

    runInAction(this, () => {
      this.overrides = { ...this.overrides, [id]: Math.max(0, Math.round(value)) };
    });
    await this.recalculate();
  }

  available(item: StockItem): number {
    return this.overrides[item.id] ?? item.available;
  }

  suggestion(id: string): ReorderSuggestion | undefined {
    return this.suggestions.find((item) => item.id === id);
  }

  private async recalculate(): Promise<void> {
    const revision = ++this.#planRevision;
    const items = this.items.map((item) => ({ ...item, available: this.available(item) }));
    const suggestions = await this.planner.plan(items);

    if (this.#closed || revision !== this.#planRevision) {
      return;
    }

    runInAction(this, () => {
      this.suggestions = suggestions;
    });
  }
}

defineModule(InventoryBoard, {
  deps: [CatalogGateway, PlanningGateway],
  name: "inventory",
  state: ["items", "overrides", "suggestions", "status", "error"],
});

export class PlanningModule {
  runs = 0;

  plan(items: readonly StockItem[]): ReorderSuggestion[] {
    this.runs += 1;
    return items.map((item) => {
      const target = Math.ceil(item.dailyDemand * item.leadDays * 1.3);
      return { id: item.id, target, order: Math.max(0, target - item.available) };
    });
  }
}

defineModule(PlanningModule, {
  actions: ["plan"],
  name: "planning",
  state: ["runs"],
});
