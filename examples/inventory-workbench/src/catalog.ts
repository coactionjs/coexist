import { CatalogGateway, type StockItem } from "./domain";

const sampleItems: readonly StockItem[] = [
  { id: "filters", name: "Water filters", available: 18, dailyDemand: 5, leadDays: 7 },
  { id: "sensors", name: "Temperature sensors", available: 9, dailyDemand: 3, leadDays: 6 },
  { id: "valves", name: "Control valves", available: 32, dailyDemand: 2, leadDays: 8 },
];

/** A replaceable stand-in for a remote catalog API. */
export class SeedCatalogGateway extends CatalogGateway {
  #failNext = false;

  failNext(): void {
    this.#failNext = true;
  }

  async list(): Promise<StockItem[]> {
    await new Promise((resolve) => setTimeout(resolve, 35));

    if (this.#failNext) {
      this.#failNext = false;
      throw new Error("Catalog temporarily unavailable");
    }

    return sampleItems.map((item) => ({ ...item }));
  }
}
