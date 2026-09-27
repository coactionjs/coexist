import { createRoot } from "react-dom/client";
import { createApp as createVueApp } from "vue";

import { CoexistProvider } from "@coexist/react";
import { coexistPlugin } from "@coexist/vue";

import { SeedCatalogGateway } from "./catalog";
import { createWorkerPlanner } from "./planner";
import { ReactPanel } from "./ReactPanel";
import VuePanel from "./VuePanel.vue";
import { createWorkbench } from "./workbench";

// oxlint-disable-next-line import/no-unassigned-import -- Vite loads example styles through CSS side effects.
import "./styles.css";

const catalog = new SeedCatalogGateway();
const workerPlanner = await createWorkerPlanner();
const { app } = createWorkbench({
  catalog,
  planner: workerPlanner.planner,
  disposePlanner: workerPlanner.dispose,
});

await app.ready;

const reactRoot = createRoot(document.getElementById("react-root")!);
reactRoot.render(
  <CoexistProvider app={app}>
    <ReactPanel catalog={catalog} />
  </CoexistProvider>,
);

const vueRoot = createVueApp(VuePanel);
vueRoot.use(coexistPlugin(app));
vueRoot.mount("#vue-root");

window.addEventListener(
  "pagehide",
  () => {
    reactRoot.unmount();
    vueRoot.unmount();
    void app.dispose();
  },
  { once: true },
);
