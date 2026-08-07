import {
  inject,
  onScopeDispose,
  provide,
  readonly,
  shallowRef,
  type App as VueApplication,
  type InjectionKey,
  type Plugin as VuePlugin,
  type Ref,
} from "vue";

import {
  CoexistError,
  type App,
  type AsyncMethodProxy,
  type InjectionToken,
  type WorkerClient,
  type WorkerStateSelector,
} from "@coexist/core";

export interface UseSelectorOptions<T> {
  readonly equals?: (value: T, previous: T) => boolean;
}

export type AppSelector<T> = (app: App) => T;
export type ModuleSelector<TModule, TValue> = (module: TModule, app: App) => TValue;

export const CoexistKey: InjectionKey<App> = Symbol("Coexist");
export const WorkerClientKey: InjectionKey<WorkerClient> = Symbol("Coexist WorkerClient");

export function provideCoexist(app: App): App {
  provide(CoexistKey, app);
  return app;
}

export function provideWorkerClient(client: WorkerClient): WorkerClient {
  provide(WorkerClientKey, client);
  return client;
}

export function coexistPlugin(app: App): VuePlugin {
  return {
    install(vueApp: VueApplication) {
      vueApp.provide(CoexistKey, app);
    },
  };
}

export function workerClientPlugin(client: WorkerClient): VuePlugin {
  return {
    install(vueApp: VueApplication) {
      vueApp.provide(WorkerClientKey, client);
    },
  };
}

export function useCoexist(): App {
  const app = inject(CoexistKey, null);

  if (app === null) {
    throw new CoexistError("Missing provideCoexist(app).");
  }

  return app;
}

export function useApp(): App {
  return useCoexist();
}

export function useModule<T>(token: InjectionToken<T>): T {
  return useCoexist().getModule(token);
}

export function useWorkerClient(): WorkerClient {
  const client = inject(WorkerClientKey, null);

  if (client === null) {
    throw new CoexistError("Missing provideWorkerClient(client).");
  }

  return client;
}

export function useWorkerModule<T extends object>(name: string): AsyncMethodProxy<T> {
  return useWorkerClient().module<T>(name);
}

export function useWorkerSelector<T>(
  selector: WorkerStateSelector<T>,
  options: UseSelectorOptions<T> = {},
): Readonly<Ref<T>> {
  const client = useWorkerClient();
  const value = shallowRef(client.select(selector)) as Ref<T>;
  const watchOptions =
    options.equals === undefined
      ? undefined
      : {
          equals: options.equals,
        };
  const unsubscribe = client.watch(
    selector,
    (next) => {
      value.value = next;
    },
    watchOptions,
  );

  onScopeDispose(unsubscribe);

  return readonly(value) as Readonly<Ref<T>>;
}

export function useWorkerComputed<T>(
  selector: WorkerStateSelector<T>,
  options: UseSelectorOptions<T> = {},
): Readonly<Ref<T>> {
  return useWorkerSelector(selector, options);
}

export function useSelector<T>(
  selector: AppSelector<T>,
  options?: UseSelectorOptions<T>,
): Readonly<Ref<T>>;
export function useSelector<TModule, TValue>(
  token: InjectionToken<TModule>,
  selector: ModuleSelector<TModule, TValue>,
  options?: UseSelectorOptions<TValue>,
): Readonly<Ref<TValue>>;
export function useSelector<TModule, TValue>(
  first: AppSelector<TValue> | InjectionToken<TModule>,
  second?: ModuleSelector<TModule, TValue> | UseSelectorOptions<TValue>,
  third?: UseSelectorOptions<TValue>,
): Readonly<Ref<TValue>> {
  const app = useCoexist();
  const selector =
    typeof second === "function"
      ? (currentApp: App) =>
          second(currentApp.getModule(first as InjectionToken<TModule>), currentApp)
      : (first as AppSelector<TValue>);
  const options = (typeof second === "function" ? third : second) ?? {};
  const value = shallowRef(selector(app)) as Ref<TValue>;
  const watchOptions =
    options.equals === undefined
      ? undefined
      : {
          equals: options.equals,
        };
  const unsubscribe = app.watch(
    () => selector(app),
    (next) => {
      value.value = next;
    },
    watchOptions,
  );

  onScopeDispose(unsubscribe);

  return readonly(value) as Readonly<Ref<TValue>>;
}

export function useComputed<T>(
  selector: AppSelector<T>,
  options?: UseSelectorOptions<T>,
): Readonly<Ref<T>>;
export function useComputed<TModule, TValue>(
  token: InjectionToken<TModule>,
  selector: ModuleSelector<TModule, TValue>,
  options?: UseSelectorOptions<TValue>,
): Readonly<Ref<TValue>>;
export function useComputed<TModule, TValue>(
  first: AppSelector<TValue> | InjectionToken<TModule>,
  second?: ModuleSelector<TModule, TValue> | UseSelectorOptions<TValue>,
  third?: UseSelectorOptions<TValue>,
): Readonly<Ref<TValue>> {
  return useSelector(
    first as InjectionToken<TModule>,
    second as ModuleSelector<TModule, TValue>,
    third,
  );
}
