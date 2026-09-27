import { create as createCoactionLocalStore } from "coaction";
import { CoexistError } from "./errors.js";
import {
  createAppInternal,
  type App,
  type CreateAppOptions,
  type EngineOptions,
  type EngineStoreFactory,
} from "./app.js";

/** An app that keeps its Coaction store in this JavaScript realm. */
export type CreateLocalAppOptions = Omit<CreateAppOptions, "engine"> & {
  readonly engine?: Omit<EngineOptions, "transport"> & { readonly transport?: never };
};

export function createApp(options: CreateLocalAppOptions = {}): App {
  if ((options.engine as EngineOptions | undefined)?.transport !== undefined) {
    throw new CoexistError("@coexist/core/local does not support engine.transport.");
  }

  return createAppInternal(options, createCoactionLocalStore as unknown as EngineStoreFactory);
}

export {
  Action,
  AmbiguousProviderError,
  AsyncProviderInSyncResolutionError,
  CircularDependencyError,
  CoexistError,
  Computed,
  createContainer,
  createLoggerPlugin,
  defineModule,
  DisposedContainerError,
  DuplicateProviderError,
  Effect,
  FrozenContainerError,
  getAppCreationCleanup,
  getModuleMetadata,
  inject,
  InjectContextError,
  lazyModule,
  LifetimeLeakError,
  MissingProviderError,
  Module,
  provide,
  runInAction,
  State,
  token,
  tokenName,
} from "./index.js";
export type {
  ActionEvent,
  App,
  AppDevOptions,
  AppProviderInput,
  AppRootState,
  AppScope,
  AppState,
  AppStore,
  BuildOptions,
  ClassProvideOptions,
  ClassProvider,
  ClassToken,
  Constructor,
  Container,
  ContainerOptions,
  DefineModuleOptions,
  DependencySpec,
  DependencyValue,
  EngineOptions,
  ErrorContext,
  ExistingProvideOptions,
  ExistingProvider,
  FactoryProvideOptions,
  FactoryProvider,
  InjectionToken,
  LazyModule,
  LazyModuleExports,
  LazyModuleLoadInput,
  LazyModuleLoadResult,
  LoggerPluginLogger,
  LoggerPluginOptions,
  ModuleCreatedEvent,
  ModuleLifecycleContext,
  ModuleMetadata,
  ModuleOptions,
  PatchEvent,
  Plugin,
  PluginContext,
  Provider,
  ProviderInput,
  ResolvedDeps,
  RunInActionOptions,
  RunInActionTarget,
  Scope,
  ScopeOptions,
  StateChangeEvent,
  Token,
  TokenValue,
  ValueProvideOptions,
  ValueProvider,
  WatchOptions,
} from "./index.js";
