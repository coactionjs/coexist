import {
  createPostMessageWorkerTransport,
  createWorkerApp,
  type PostMessageEndpoint,
} from "@coexist/core";

import { PlanningModule } from "./domain";

const host = createWorkerApp({
  providers: [PlanningModule],
  sync: "patch",
  transport: createPostMessageWorkerTransport(globalThis as unknown as PostMessageEndpoint),
});

void host.ready;
