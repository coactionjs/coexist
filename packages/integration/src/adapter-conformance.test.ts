import {
  createEnvironmentInjector,
  runInInjectionContext,
  type EnvironmentInjector,
  type Signal,
} from "@angular/core";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createRoot, getOwner, runWithOwner, type Accessor } from "solid-js";
import { get } from "svelte/store";
import { createSSRApp, effectScope, type Ref } from "vue";

import type { App, WorkerClient } from "@coexist/core";
import {
  injectModule as injectAngularModule,
  injectSignal as injectAngularSignal,
  injectWorkerModule as injectAngularWorkerModule,
  injectWorkerSignal as injectAngularWorkerSignal,
  provideCoexist as provideAngularCoexist,
  provideWorkerClient as provideAngularWorkerClient,
} from "@coexist/angular";
import {
  CoexistProvider as ReactCoexistProvider,
  useModule as useReactModule,
  useSelector as useReactSelector,
  useWorkerModule as useReactWorkerModule,
  useWorkerSelector as useReactWorkerSelector,
  WorkerClientProvider as ReactWorkerClientProvider,
} from "@coexist/react";
import {
  CoexistProvider as SolidCoexistProvider,
  useComputed as useSolidComputed,
  useModule as useSolidModule,
  useWorkerModule as useSolidWorkerModule,
  useWorkerSelector as useSolidWorkerSelector,
  WorkerClientProvider as SolidWorkerClientProvider,
} from "@coexist/solid";
import {
  clearCoexistApp,
  clearWorkerClient,
  moduleStore as svelteModuleStore,
  selectedModuleStore as selectedSvelteModuleStore,
  workerModuleStore as svelteWorkerModuleStore,
  workerSelectorStore as svelteWorkerSelectorStore,
} from "@coexist/svelte";
import {
  coexistPlugin as vueCoexistPlugin,
  useComputed as useVueComputed,
  useModule as useVueModule,
  useWorkerComputed as useVueWorkerComputed,
  useWorkerModule as useVueWorkerModule,
  workerClientPlugin as vueWorkerClientPlugin,
} from "@coexist/vue";

import {
  ConformanceCounter,
  describeAdapterConformance,
  type AdapterBinding,
  type AdapterObservation,
  type WorkerAdapterObservation,
} from "./adapterConformance.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const conformanceModuleName = "adapterConformanceCounter";

const selectConformanceCount = (state: unknown): number =>
  (state as Record<string, { count: number }>)[conformanceModuleName]?.count ?? Number.NaN;

function ReactWorkerViewWithoutProvider() {
  useReactWorkerModule<ConformanceCounter>(conformanceModuleName);
  return null;
}

function ReactViewWithoutProvider() {
  useReactModule(ConformanceCounter);
  return null;
}

const reactBinding: AdapterBinding = {
  name: "react",
  missingAppMessage: "Missing CoexistProvider.",
  observe(app: App): AdapterObservation {
    let module: ConformanceCounter | undefined;
    let value = Number.NaN;
    let renderer: ReactTestRenderer | undefined;

    function View() {
      module = useReactModule(ConformanceCounter);
      value = useReactSelector(ConformanceCounter, (counter) => counter.count);
      return null;
    }

    act(() => {
      renderer = create(createElement(ReactCoexistProvider, { app }, createElement(View)));
    });

    return {
      module: module as ConformanceCounter,
      dispose() {
        act(() => {
          renderer?.unmount();
        });
      },
      read: () => value,
    };
  },
  readWithoutApp() {
    act(() => {
      create(createElement(ReactViewWithoutProvider));
    });
  },
  missingClientMessage: "Missing WorkerClientProvider.",
  observeWorker(client: WorkerClient): WorkerAdapterObservation {
    let module: WorkerAdapterObservation["module"] | undefined;
    let value = Number.NaN;
    let renderer: ReactTestRenderer | undefined;

    function View() {
      module = useReactWorkerModule<ConformanceCounter>(conformanceModuleName);
      value = useReactWorkerSelector(selectConformanceCount);
      return null;
    }

    act(() => {
      renderer = create(createElement(ReactWorkerClientProvider, { client }, createElement(View)));
    });

    return {
      module: module as WorkerAdapterObservation["module"],
      dispose() {
        act(() => {
          renderer?.unmount();
        });
      },
      read: () => value,
    };
  },
  readWithoutClient() {
    act(() => {
      create(createElement(ReactWorkerViewWithoutProvider));
    });
  },
  runAction(action) {
    act(action);
  },
  async flush() {
    await act(async () => {
      await Promise.resolve();
    });
  },
};

const vueBinding: AdapterBinding = {
  name: "vue",
  missingAppMessage: "Missing provideCoexist(app).",
  observe(app: App): AdapterObservation {
    const vueApp = createSSRApp({ render: () => null });
    vueApp.use(vueCoexistPlugin(app));
    const scope = effectScope();
    let module: ConformanceCounter | undefined;
    let value: Readonly<Ref<number>> | undefined;

    scope.run(() => {
      vueApp.runWithContext(() => {
        module = useVueModule(ConformanceCounter);
        value = useVueComputed((current) => current.getModule(ConformanceCounter).count);
      });
    });

    return {
      module: module as ConformanceCounter,
      dispose() {
        scope.stop();
      },
      read: () => value?.value ?? Number.NaN,
    };
  },
  readWithoutApp() {
    const vueApp = createSSRApp({ render: () => null });
    return vueApp.runWithContext(() => useVueModule(ConformanceCounter));
  },
  missingClientMessage: "Missing provideWorkerClient(client).",
  observeWorker(client: WorkerClient): WorkerAdapterObservation {
    const vueApp = createSSRApp({ render: () => null });
    vueApp.use(vueWorkerClientPlugin(client));
    const scope = effectScope();
    let module: WorkerAdapterObservation["module"] | undefined;
    let value: Readonly<Ref<number>> | undefined;

    scope.run(() => {
      vueApp.runWithContext(() => {
        module = useVueWorkerModule<ConformanceCounter>(conformanceModuleName);
        value = useVueWorkerComputed(selectConformanceCount);
      });
    });

    return {
      module: module as WorkerAdapterObservation["module"],
      dispose() {
        scope.stop();
      },
      read: () => value?.value ?? Number.NaN,
    };
  },
  readWithoutClient() {
    const vueApp = createSSRApp({ render: () => null });
    return vueApp.runWithContext(() =>
      useVueWorkerModule<ConformanceCounter>(conformanceModuleName),
    );
  },
};

const solidBinding: AdapterBinding = {
  name: "solid",
  missingAppMessage: "Missing Solid CoexistProvider.",
  observe(app: App): AdapterObservation {
    let dispose: (() => void) | undefined;
    let module: ConformanceCounter | undefined;
    let value: Accessor<number> | undefined;

    createRoot((disposeRoot) => {
      dispose = disposeRoot;
      SolidCoexistProvider({
        app,
        get children() {
          const owner = getOwner();

          if (owner === null) {
            throw new Error("Missing Solid owner.");
          }

          runWithOwner(owner, () => {
            module = useSolidModule(ConformanceCounter);
            value = useSolidComputed(ConformanceCounter, (counter) => counter.count);
          });

          return undefined;
        },
      });
    });

    return {
      module: module as ConformanceCounter,
      dispose() {
        dispose?.();
      },
      read: () => value?.() ?? Number.NaN,
    };
  },
  readWithoutApp() {
    return createRoot((dispose) => {
      try {
        return useSolidModule(ConformanceCounter);
      } finally {
        dispose();
      }
    });
  },
  missingClientMessage: "Missing Solid WorkerClientProvider.",
  observeWorker(client: WorkerClient): WorkerAdapterObservation {
    let dispose: (() => void) | undefined;
    let module: WorkerAdapterObservation["module"] | undefined;
    let value: Accessor<number> | undefined;

    createRoot((disposeRoot) => {
      dispose = disposeRoot;
      SolidWorkerClientProvider({
        client,
        get children() {
          const owner = getOwner();

          if (owner === null) {
            throw new Error("Missing Solid owner.");
          }

          runWithOwner(owner, () => {
            module = useSolidWorkerModule<ConformanceCounter>(conformanceModuleName);
            value = useSolidWorkerSelector(selectConformanceCount);
          });

          return undefined;
        },
      });
    });

    return {
      module: module as WorkerAdapterObservation["module"],
      dispose() {
        dispose?.();
      },
      read: () => value?.() ?? Number.NaN,
    };
  },
  readWithoutClient() {
    return createRoot((dispose) => {
      try {
        return useSolidWorkerModule<ConformanceCounter>(conformanceModuleName);
      } finally {
        dispose();
      }
    });
  },
};

const svelteBinding: AdapterBinding = {
  name: "svelte",
  missingAppMessage: "Missing Coexist Svelte app.",
  observe(app: App): AdapterObservation {
    // Pass the app explicitly rather than through the module global, so two
    // apps can be observed at once exactly as they can in SSR.
    const module = get(svelteModuleStore(ConformanceCounter, app));
    const store = selectedSvelteModuleStore(ConformanceCounter, (counter) => counter.count, {
      app,
    });
    let value = Number.NaN;
    const unsubscribe = store.subscribe((next) => {
      value = next;
    });

    return {
      module,
      dispose: unsubscribe,
      read: () => value,
    };
  },
  readWithoutApp() {
    clearCoexistApp();
    return get(svelteModuleStore(ConformanceCounter));
  },
  missingClientMessage: "Missing Coexist Svelte worker client.",
  observeWorker(client: WorkerClient): WorkerAdapterObservation {
    const module = get(svelteWorkerModuleStore<ConformanceCounter>(conformanceModuleName, client));
    const store = svelteWorkerSelectorStore(selectConformanceCount, { client });
    let value = Number.NaN;
    const unsubscribe = store.subscribe((next) => {
      value = next;
    });

    return {
      module,
      dispose: unsubscribe,
      read: () => value,
    };
  },
  readWithoutClient() {
    clearWorkerClient();
    return get(svelteWorkerModuleStore<ConformanceCounter>(conformanceModuleName));
  },
};

const angularBinding: AdapterBinding = {
  name: "angular",
  // Angular reports a missing provider in its own vocabulary; the contract only
  // requires that resolution fails loudly rather than yielding undefined.
  missingAppMessage: "No provider found for `InjectionToken Coexist App`",
  observe(app: App): AdapterObservation {
    const injector = createEnvironmentInjector(
      [provideAngularCoexist(app)],
      null as unknown as EnvironmentInjector,
    );
    let module: ConformanceCounter | undefined;
    let value: Signal<number> | undefined;

    runInInjectionContext(injector, () => {
      module = injectAngularModule(ConformanceCounter);
      value = injectAngularSignal(ConformanceCounter, (counter) => counter.count);
    });

    return {
      module: module as ConformanceCounter,
      dispose() {
        injector.destroy();
      },
      read: () => value?.() ?? Number.NaN,
    };
  },
  readWithoutApp() {
    const injector = createEnvironmentInjector([], null as unknown as EnvironmentInjector);

    try {
      return runInInjectionContext(injector, () => injectAngularModule(ConformanceCounter));
    } finally {
      injector.destroy();
    }
  },
  missingClientMessage: "No provider found for `InjectionToken Coexist WorkerClient`",
  observeWorker(client: WorkerClient): WorkerAdapterObservation {
    const injector = createEnvironmentInjector(
      [provideAngularWorkerClient(client)],
      null as unknown as EnvironmentInjector,
    );
    let module: WorkerAdapterObservation["module"] | undefined;
    let value: Signal<number> | undefined;

    runInInjectionContext(injector, () => {
      module = injectAngularWorkerModule<ConformanceCounter>(conformanceModuleName);
      value = injectAngularWorkerSignal(selectConformanceCount);
    });

    return {
      module: module as WorkerAdapterObservation["module"],
      dispose() {
        injector.destroy();
      },
      read: () => value?.() ?? Number.NaN,
    };
  },
  readWithoutClient() {
    const injector = createEnvironmentInjector([], null as unknown as EnvironmentInjector);

    try {
      return runInInjectionContext(injector, () =>
        injectAngularWorkerModule<ConformanceCounter>(conformanceModuleName),
      );
    } finally {
      injector.destroy();
    }
  },
};

for (const binding of [reactBinding, vueBinding, solidBinding, svelteBinding, angularBinding]) {
  describeAdapterConformance(binding);
}
