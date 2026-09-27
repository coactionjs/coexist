import { createPostMessageWorkerTransport, createWorkerClient } from "@coexist/core";

import { PlanningGateway, type PlanningModule, type StockItem } from "./domain";

export async function createWorkerPlanner(): Promise<{
  planner: PlanningGateway;
  dispose(): void;
}> {
  const worker = new Worker(new URL("./planner.worker.ts", import.meta.url), { type: "module" });
  const client = createWorkerClient({ transport: createPostMessageWorkerTransport(worker) });

  try {
    await client.ready;
  } catch (error) {
    client.dispose();
    worker.terminate();
    throw error;
  }

  const remote = client.module<PlanningModule>("planning");

  return {
    planner: {
      plan(items: readonly StockItem[]) {
        return remote.plan(items);
      },
    },
    dispose() {
      client.dispose();
      worker.terminate();
    },
  };
}
