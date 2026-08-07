import {
  provide,
  token,
  type App,
  type InjectionToken,
  type Plugin,
  type StateChangeEvent,
} from "@coexist/core";
import localspace, {
  compressionPlugin,
  encryptionPlugin,
  indexedDBDriver,
  localStorageDriver,
  memoryDriver,
  quotaPlugin,
  syncPlugin,
  ttlPlugin,
  type LocalSpaceConfig,
  type LocalSpaceInstance,
  type LocalSpaceOptions,
  type PerformanceStats,
} from "localspace";

/**
 * localspace's drivers and plugins pass straight through, so configuring a store
 * does not need a second install. Their types stay localspace's.
 *
 * localspace's *types* are deliberately not re-exported. A re-exported type is
 * this package's API — localspace changing one would be a breaking change here,
 * and the report reviewers read would carry it. `LocalSpaceInstance` alone put
 * some fifty members into that surface, seven of them internals (`_dbInfo`,
 * `_driverSet`, `_initStorage`, `_config`, `_defaultConfig`, `_ready`,
 * `_initReady`) that no consumer should hold this package to. That is the same
 * mistake `AppStore` exists to correct in the core. These types now appear only
 * as bare names inside the signatures below, exactly as Coaction's `Store` does
 * inside `AppStore`; import one from `localspace` when you need to name it.
 */
export {
  compressionPlugin,
  encryptionPlugin,
  indexedDBDriver,
  localStorageDriver,
  memoryDriver,
  quotaPlugin,
  syncPlugin,
  ttlPlugin,
};

export interface StorageLike {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem?(key: string): void | Promise<void>;
}

export interface StorageEntry<T> {
  readonly key: string;
  readonly value: T;
}

export type StorageEntries<T> =
  | readonly StorageEntry<T>[]
  | ReadonlyMap<string, T>
  | Record<string, T>;

export type StorageBatchResponse<T> = Array<{
  readonly key: string;
  readonly value: T | null;
}>;

export type StorageTransactionMode = "readonly" | "readwrite";

export interface StorageTransactionScope {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<T>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
  iterate<T, U>(iterator: (value: T, key: string, iterationNumber: number) => U): Promise<U>;
  clear(): Promise<void>;
}

export interface StorageService {
  readonly instance: LocalSpaceInstance;
  ready(): Promise<void>;
  driver(): string | null;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<T>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
  length(): Promise<number>;
  setMany<T>(entries: StorageEntries<T>): Promise<StorageBatchResponse<T>>;
  getMany<T>(keys: readonly string[]): Promise<StorageBatchResponse<T>>;
  removeMany(keys: readonly string[]): Promise<void>;
  transaction<T>(
    mode: StorageTransactionMode,
    runner: (scope: StorageTransactionScope) => Promise<T> | T,
  ): Promise<T>;
  dropInstance(options?: LocalSpaceConfig): Promise<void>;
  destroy(): Promise<void>;
  getPerformanceStats(): PerformanceStats | undefined;
}

export interface CreateLocalSpaceStorageOptions {
  readonly instance?: LocalSpaceInstance;
  readonly localspace?: LocalSpaceInstance;
  readonly options?: LocalSpaceOptions;
}

export const StorageToken: InjectionToken<StorageService> =
  token<StorageService>("Coexist Storage");

export interface StoragePluginOptions<TState = unknown> {
  readonly key: string;
  readonly storage: StorageLike;
  readonly serialize?: (state: TState) => string;
  readonly deserialize?: (value: string) => TState;
  readonly partialize?: (state: unknown) => TState;
  readonly merge?: (persisted: TState, current: unknown) => unknown;
  readonly shouldPersist?: (event: StateChangeEvent) => boolean;
  readonly onError?: (error: unknown, phase: StoragePluginErrorPhase) => void;
  /**
   * Trailing-edge throttle for state-change persistence in milliseconds.
   * At most one write per interval, always with the latest state. Pending
   * writes are flushed on plugin dispose. Omit or pass 0 to persist every
   * state change.
   */
  readonly throttleMs?: number;
}

export type StoragePluginErrorPhase = "clear" | "hydrate" | "persist";

export interface StoragePlugin extends Plugin {
  clear(): Promise<void>;
  flush(): Promise<void>;
  persist(app: App): Promise<void>;
  ready(): Promise<void>;
}

export interface LocalSpaceStoragePluginOptions<
  TState = unknown,
> extends CreateLocalSpaceStorageOptions {
  readonly key?: string;
  readonly service?: StorageService;
  readonly hydrate?: boolean;
  readonly persist?: boolean;
  readonly destroyOnDispose?: boolean;
  readonly partialize?: (state: unknown) => TState;
  readonly merge?: (persisted: TState, current: unknown) => unknown;
  readonly shouldPersist?: (event: StateChangeEvent) => boolean;
  readonly onError?: (error: unknown, phase: StoragePluginErrorPhase) => void;
  /**
   * Trailing-edge throttle for state-change persistence in milliseconds.
   * Omit or pass 0 to persist every state change.
   */
  readonly throttleMs?: number;
}

export interface LocalSpaceStoragePlugin extends StoragePlugin {
  readonly storage: StorageService;
}

export function createLocalSpaceStorage(
  options: CreateLocalSpaceStorageOptions = {},
): StorageService {
  const instance =
    options.instance ?? (options.localspace ?? localspace).createInstance(options.options);

  return {
    instance,
    clear() {
      return instance.clear();
    },
    destroy() {
      return instance.destroy();
    },
    driver() {
      return instance.driver();
    },
    dropInstance(dropOptions) {
      return instance.dropInstance(dropOptions);
    },
    get(key) {
      return instance.getItem(key);
    },
    getMany<T>(keys: readonly string[]): Promise<StorageBatchResponse<T>> {
      return instance.getItems<T>([...keys]) as Promise<StorageBatchResponse<T>>;
    },
    getPerformanceStats() {
      return instance.getPerformanceStats?.();
    },
    keys() {
      return instance.keys();
    },
    length() {
      return instance.length();
    },
    ready() {
      return instance.ready();
    },
    remove(key) {
      return instance.removeItem(key);
    },
    removeMany(keys) {
      return instance.removeItems([...keys]);
    },
    set(key, value) {
      return instance.setItem(key, value);
    },
    setMany<T>(entries: StorageEntries<T>): Promise<StorageBatchResponse<T>> {
      return instance.setItems<T>(entries as never) as Promise<StorageBatchResponse<T>>;
    },
    transaction(mode, runner) {
      return instance.runTransaction(mode, runner as never);
    },
  };
}

export function createLocalSpaceStoragePlugin<TState = unknown>(
  options: LocalSpaceStoragePluginOptions<TState> = {},
): LocalSpaceStoragePlugin {
  const key = options.key ?? "coexist:state";
  const storage =
    options.service ??
    createLocalSpaceStorage({
      instance: options.instance,
      localspace: options.localspace,
      options: options.options,
    });
  const partialize = options.partialize ?? ((state: unknown) => state as TState);
  const merge = options.merge ?? ((persisted: TState) => persisted);
  const shouldHydrate = options.hydrate !== false;
  const shouldPersist = options.persist !== false;
  const destroyOnDispose =
    options.destroyOnDispose ?? (options.service === undefined && options.instance === undefined);
  const hydration = createHydrationGate();
  let writeQueue: Promise<void> = Promise.resolve();

  const runQueued = (
    phase: StoragePluginErrorPhase,
    task: () => void | Promise<void>,
  ): Promise<void> => {
    const operation = writeQueue.catch(() => undefined).then(task);
    writeQueue = operation.catch((error: unknown) => {
      reportStorageError(options.onError, error, phase);
    });

    return operation;
  };
  const pendingWrites = createTrailingThrottle<TState>(options.throttleMs ?? 0, (state) => {
    void runQueued("persist", async () => {
      await storage.set(key, state);
    }).catch(() => undefined);
  });

  return {
    name: "coexist:storage",
    providers: [provide(StorageToken, { useValue: storage })],
    storage,
    async clear() {
      await hydration.pending();
      pendingWrites.discard();
      await runQueued("clear", async () => {
        await storage.remove(key);
      });
    },
    async flush() {
      await hydration.pending();
      pendingWrites.flush();
      await writeQueue;
    },
    onStateChange(event) {
      if (!shouldPersist) {
        return;
      }

      if (options.shouldPersist !== undefined && !options.shouldPersist(event)) {
        return;
      }

      pendingWrites.schedule(partialize(event.state));
    },
    async persist(app) {
      await hydration.pending();
      pendingWrites.discard();
      await runQueued("persist", async () => {
        await storage.set(key, partialize(app.store.getPureState()));
      });
    },
    ready() {
      return hydration.promise;
    },
    setup(app, context) {
      context.onDispose(async () => {
        const errors: unknown[] = [];

        try {
          await hydration.pending();
        } catch (error) {
          errors.push(error);
        }

        pendingWrites.flush();

        try {
          await writeQueue;
        } catch (error) {
          errors.push(error);
        }

        if (destroyOnDispose) {
          try {
            await storage.destroy();
          } catch (error) {
            errors.push(error);
          }
        }

        if (errors.length === 1) {
          throw errors[0];
        }

        if (errors.length > 1) {
          throw new AggregateError(errors, "One or more storage disposal steps failed.");
        }
      });

      return hydration.settle(
        (async () => {
          try {
            await storage.ready();

            if (!shouldHydrate) {
              return;
            }

            const stored = await storage.get<TState>(key);

            if (stored === null) {
              return;
            }

            app.runInAction(
              () => app.store.setState(merge(stored, app.store.getPureState()) as never),
              { name: "storage.hydrate" },
            );
          } catch (error) {
            reportStorageError(options.onError, error, "hydrate");
            throw error;
          }
        })(),
      );
    },
    dispose() {
      // An app disposed before this plugin's setup ran will never hydrate, so
      // `ready()` must settle rather than stay pending forever.
      hydration.abandon(new Error("Storage plugin was disposed before hydration started."));
    },
  };
}

export function createStoragePlugin<TState = unknown>(
  options: StoragePluginOptions<TState>,
): StoragePlugin {
  const serialize = options.serialize ?? JSON.stringify;
  const deserialize = options.deserialize ?? JSON.parse;
  const partialize = options.partialize ?? ((state: unknown) => state as TState);
  const merge = options.merge ?? ((persisted: TState) => persisted);
  const hydration = createHydrationGate();
  let writeQueue: Promise<void> = Promise.resolve();

  const runQueued = (
    phase: StoragePluginErrorPhase,
    task: () => void | Promise<void>,
  ): Promise<void> => {
    const operation = writeQueue.catch(() => undefined).then(task);
    writeQueue = operation.catch((error: unknown) => {
      reportStorageError(options.onError, error, phase);
    });

    return operation;
  };
  const pendingWrites = createTrailingThrottle<TState>(options.throttleMs ?? 0, (state) => {
    void runQueued("persist", async () => {
      await options.storage.setItem(options.key, serialize(state));
    }).catch(() => undefined);
  });

  return {
    name: "coexist:storage",
    async clear() {
      await hydration.pending();
      pendingWrites.discard();
      await runQueued("clear", async () => {
        await options.storage.removeItem?.(options.key);
      });
    },
    async flush() {
      await hydration.pending();
      pendingWrites.flush();
      await writeQueue;
    },
    onStateChange(event) {
      if (options.shouldPersist !== undefined && !options.shouldPersist(event)) {
        return;
      }

      pendingWrites.schedule(partialize(event.state));
    },
    async persist(app) {
      await hydration.pending();
      pendingWrites.discard();
      await runQueued("persist", async () => {
        await options.storage.setItem(options.key, serialize(partialize(app.store.getPureState())));
      });
    },
    ready() {
      return hydration.promise;
    },
    setup(app, context) {
      context.onDispose(async () => {
        const errors: unknown[] = [];

        try {
          await hydration.pending();
        } catch (error) {
          errors.push(error);
        }

        pendingWrites.flush();

        try {
          await writeQueue;
        } catch (error) {
          errors.push(error);
        }

        if (errors.length === 1) {
          throw errors[0];
        }

        if (errors.length > 1) {
          throw new AggregateError(errors, "One or more storage disposal steps failed.");
        }
      });

      return hydration.settle(
        (async () => {
          try {
            const stored = await options.storage.getItem(options.key);

            if (stored === null) {
              return;
            }

            app.runInAction(
              () =>
                app.store.setState(merge(deserialize(stored), app.store.getPureState()) as never),
              { name: "storage.hydrate" },
            );
          } catch (error) {
            reportStorageError(options.onError, error, "hydrate");
            throw error;
          }
        })(),
      );
    },
    dispose() {
      // An app disposed before this plugin's setup ran will never hydrate, so
      // `ready()` must settle rather than stay pending forever.
      hydration.abandon(new Error("Storage plugin was disposed before hydration started."));
    },
  };
}

interface HydrationGate {
  /** What `ready()` returns: settles only once hydration has actually run. */
  readonly promise: Promise<void>;
  /**
   * What the write path waits on. A plugin used standalone — never installed
   * in an app — has no hydration to order against, so writes must not block.
   */
  pending(): Promise<void>;
  settle(hydration: Promise<void>): Promise<void>;
  abandon(error: unknown): void;
}

/**
 * `ready()` must describe hydration even before the app runs plugin setup.
 * Plugin setup starts on a later microtask than `createApp()`, so a plugin that
 * only replaced an already-resolved promise inside `setup()` let
 * `await plugin.ready()` return before hydration had begun.
 */
function createHydrationGate(): HydrationGate {
  let resolveHydration!: () => void;
  let rejectHydration!: (error: unknown) => void;
  let started = false;
  const promise = new Promise<void>((resolve, reject) => {
    resolveHydration = resolve;
    rejectHydration = reject;
  });

  promise.catch(() => undefined);

  return {
    promise,
    pending() {
      return started ? promise : Promise.resolve();
    },
    /** Settles `ready()` for an app that was disposed before plugin setup ran. */
    abandon(error) {
      if (started) {
        return;
      }

      started = true;
      rejectHydration(error);
    },
    async settle(hydration) {
      started = true;

      try {
        await hydration;
        resolveHydration();
      } catch (error) {
        rejectHydration(error);
        throw error;
      }
    },
  };
}

interface TrailingThrottle<T> {
  discard(): void;
  flush(): void;
  schedule(value: T): void;
}

function createTrailingThrottle<T>(
  throttleMs: number,
  enqueue: (value: T) => void,
): TrailingThrottle<T> {
  const delay = Number.isFinite(throttleMs) && throttleMs > 0 ? throttleMs : 0;
  let hasPending = false;
  let pendingValue: T | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancelTimer = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  const discard = (): void => {
    cancelTimer();
    hasPending = false;
    pendingValue = undefined;
  };
  const flush = (): void => {
    cancelTimer();

    if (!hasPending) {
      return;
    }

    const value = pendingValue as T;
    hasPending = false;
    pendingValue = undefined;
    enqueue(value);
  };

  return {
    discard,
    flush,
    schedule(value) {
      if (delay === 0) {
        enqueue(value);
        return;
      }

      hasPending = true;
      pendingValue = value;
      timer ??= setTimeout(flush, delay);
    },
  };
}

function reportStorageError(
  onError: StoragePluginOptions["onError"] | undefined,
  error: unknown,
  phase: StoragePluginErrorPhase,
): void {
  try {
    onError?.(error, phase);
  } catch {
    // Storage error observers must not replace failures or re-open handled background errors.
  }
}
