import {
  DestroyRef,
  InjectionToken,
  inject,
  makeEnvironmentProviders,
  signal,
  type EnvironmentProviders,
  type Signal,
} from "@angular/core";

import {
  type App,
  type AsyncMethodProxy,
  type InjectionToken as CoexistToken,
  type WorkerClient,
  type WorkerStateSelector,
} from "@coexist/core";

export interface InjectSignalOptions<T> {
  readonly equals?: (value: T, previous: T) => boolean;
}

export type AppSelector<T> = (app: App) => T;
export type ModuleSelector<TModule, TValue> = (module: TModule, app: App) => TValue;

export const COEXIST_APP: InjectionToken<App> = new InjectionToken<App>("Coexist App");
export const COEXIST_WORKER_CLIENT: InjectionToken<WorkerClient> = new InjectionToken<WorkerClient>(
  "Coexist WorkerClient",
);

export function provideCoexist(app: App): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: COEXIST_APP,
      useValue: app,
    },
  ]);
}

export function provideWorkerClient(client: WorkerClient): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: COEXIST_WORKER_CLIENT,
      useValue: client,
    },
  ]);
}

export function injectCoexistApp(): App {
  return inject(COEXIST_APP);
}

export function injectModule<T>(token: CoexistToken<T>): T {
  return injectCoexistApp().getModule(token);
}

export function injectWorkerClient(): WorkerClient {
  return inject(COEXIST_WORKER_CLIENT);
}

export function injectWorkerModule<T extends object>(name: string): AsyncMethodProxy<T> {
  return injectWorkerClient().module<T>(name);
}

export function injectWorkerSignal<T>(
  selector: WorkerStateSelector<T>,
  options?: InjectSignalOptions<T>,
): Signal<T> {
  const client = injectWorkerClient();
  const destroyRef = inject(DestroyRef);
  const equals = options?.equals ?? Object.is;
  const value = signal(client.select(selector), { equal: equals });
  const unsubscribe = client.watch(
    selector,
    (next) => {
      value.set(next);
    },
    { equals },
  );

  destroyRef.onDestroy(unsubscribe);

  return value.asReadonly();
}

export function injectSignal<T>(
  selector: AppSelector<T>,
  options?: InjectSignalOptions<T>,
): Signal<T>;
export function injectSignal<TModule, TValue>(
  token: CoexistToken<TModule>,
  selector: ModuleSelector<TModule, TValue>,
  options?: InjectSignalOptions<TValue>,
): Signal<TValue>;
export function injectSignal<TModule, TValue>(
  first: AppSelector<TValue> | CoexistToken<TModule>,
  second?: ModuleSelector<TModule, TValue> | InjectSignalOptions<TValue>,
  third?: InjectSignalOptions<TValue>,
): Signal<TValue> {
  const app = injectCoexistApp();
  const destroyRef = inject(DestroyRef);
  const selector =
    typeof second === "function"
      ? (currentApp: App) =>
          second(currentApp.getModule(first as CoexistToken<TModule>), currentApp)
      : (first as AppSelector<TValue>);
  const options = typeof second === "function" ? third : second;
  const equals = options?.equals ?? Object.is;
  const value = signal(selector(app), { equal: equals });
  const unsubscribe = app.watch(
    () => selector(app),
    (next) => {
      value.set(next);
    },
    { equals },
  );

  destroyRef.onDestroy(unsubscribe);

  return value.asReadonly();
}
