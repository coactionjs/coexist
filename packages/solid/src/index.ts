import {
  createContext,
  createSignal,
  onCleanup,
  useContext,
  type Accessor,
  type Context,
  type JSX,
} from "solid-js";

import {
  CoexistError,
  type App,
  type AsyncMethodProxy,
  type InjectionToken,
  type WorkerClient,
  type WorkerStateSelector,
} from "@coexist/core";

export interface CoexistProviderProps {
  readonly app: App;
  readonly children?: JSX.Element;
}

export interface WorkerClientProviderProps {
  readonly client: WorkerClient;
  readonly children?: JSX.Element;
}

export interface UseComputedOptions<T> {
  readonly equals?: (value: T, previous: T) => boolean;
}

export type AppSelector<T> = (app: App) => T;
export type ModuleSelector<TModule, TValue> = (module: TModule, app: App) => TValue;

export const CoexistContext: Context<App | undefined> = createContext<App>();
export const WorkerClientContext: Context<WorkerClient | undefined> = createContext<WorkerClient>();

export function CoexistProvider(props: CoexistProviderProps): JSX.Element {
  return CoexistContext.Provider({
    get children() {
      return props.children;
    },
    value: props.app,
  });
}

export function WorkerClientProvider(props: WorkerClientProviderProps): JSX.Element {
  return WorkerClientContext.Provider({
    get children() {
      return props.children;
    },
    value: props.client,
  });
}

export function useApp(): App {
  const app = useContext(CoexistContext);

  if (app === undefined) {
    throw new CoexistError("Missing Solid CoexistProvider.");
  }

  return app;
}

export function useModule<T>(token: InjectionToken<T>): T {
  return useApp().getModule(token);
}

export function useWorkerClient(): WorkerClient {
  const client = useContext(WorkerClientContext);

  if (client === undefined) {
    throw new CoexistError("Missing Solid WorkerClientProvider.");
  }

  return client;
}

export function useWorkerModule<T extends object>(name: string): AsyncMethodProxy<T> {
  return useWorkerClient().module<T>(name);
}

export function useWorkerComputed<T>(
  selector: WorkerStateSelector<T>,
  options?: UseComputedOptions<T>,
): Accessor<T> {
  const client = useWorkerClient();
  const equals = options?.equals ?? Object.is;
  const [value, setValue] = createSignal(client.select(selector), { equals });
  const unsubscribe = client.watch(
    selector,
    (next) => {
      setValue(() => next);
    },
    { equals },
  );

  onCleanup(unsubscribe);

  return value;
}

export function useWorkerSelector<T>(
  selector: WorkerStateSelector<T>,
  options?: UseComputedOptions<T>,
): Accessor<T> {
  return useWorkerComputed(selector, options);
}

export function useComputed<T>(
  selector: AppSelector<T>,
  options?: UseComputedOptions<T>,
): Accessor<T>;
export function useComputed<TModule, TValue>(
  token: InjectionToken<TModule>,
  selector: ModuleSelector<TModule, TValue>,
  options?: UseComputedOptions<TValue>,
): Accessor<TValue>;
export function useComputed<TModule, TValue>(
  first: AppSelector<TValue> | InjectionToken<TModule>,
  second?: ModuleSelector<TModule, TValue> | UseComputedOptions<TValue>,
  third?: UseComputedOptions<TValue>,
): Accessor<TValue> {
  const app = useApp();
  const selector =
    typeof second === "function"
      ? (currentApp: App) =>
          second(currentApp.getModule(first as InjectionToken<TModule>), currentApp)
      : (first as AppSelector<TValue>);
  const options = typeof second === "function" ? third : second;
  const equals = options?.equals ?? Object.is;
  const [value, setValue] = createSignal(selector(app), { equals });
  const unsubscribe = app.watch(
    () => selector(app),
    (next) => {
      setValue(() => next);
    },
    { equals },
  );

  onCleanup(unsubscribe);

  return value;
}

/**
 * `useComputed` under the name every other adapter uses for app state.
 *
 * Solid was the one adapter where the app selector and the worker selector
 * disagreed: worker state could be read as `useWorkerSelector` *or*
 * `useWorkerComputed`, while app state was `useComputed` only. Someone moving
 * between adapters — the thing this project is for — reached for `useSelector`
 * and found it missing on exactly one of the five.
 */
export function useSelector<T>(
  selector: AppSelector<T>,
  options?: UseComputedOptions<T>,
): Accessor<T>;
export function useSelector<TModule, TValue>(
  token: InjectionToken<TModule>,
  selector: ModuleSelector<TModule, TValue>,
  options?: UseComputedOptions<TValue>,
): Accessor<TValue>;
export function useSelector<TModule, TValue>(
  first: AppSelector<TValue> | InjectionToken<TModule>,
  second?: ModuleSelector<TModule, TValue> | UseComputedOptions<TValue>,
  third?: UseComputedOptions<TValue>,
): Accessor<TValue> {
  return (useComputed as (...args: readonly unknown[]) => Accessor<TValue>)(first, second, third);
}
