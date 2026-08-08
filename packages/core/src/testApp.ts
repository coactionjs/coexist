import { createAppInternal, type MutableTestInspector } from "./app.js";
import type { ActionEvent, App, CreateAppOptions, TestAppInspector } from "./app.js";
import type { ProviderInput } from "./types.js";

export interface TestAppOptions extends Omit<CreateAppOptions, "providers"> {
  readonly providers?: readonly ProviderInput[];
  readonly overrides?: readonly ProviderInput[];
  readonly autoStart?: boolean;
  readonly strictActions?: boolean;
}

/**
 * `App` plus the inspector, written as `App` rather than as the return type of
 * the internal factory that builds it.
 *
 * `extends ReturnType<typeof createAppInternal>` resolved to the same thing,
 * but it made the declaration reference `createAppInternal` — so the emitted
 * `.d.ts` had to declare that function, and `InternalCreateAppOptions` and
 * `MutableTestInspector` behind it, none of which the package exports. A
 * consumer's type resolution then depended on the shape of internals, and
 * changing an internal option changed the published declarations.
 */
export interface TestApp extends App {
  readonly test: TestAppInspector;
}

export interface AutoStartedTestAppOptions extends Omit<TestAppOptions, "autoStart"> {
  readonly autoStart: true;
}

export interface ManualTestAppOptions extends Omit<TestAppOptions, "autoStart"> {
  readonly autoStart?: false;
}

export function testApp(options: AutoStartedTestAppOptions): Promise<TestApp>;
export function testApp(options?: ManualTestAppOptions): TestApp;
export function testApp(options: TestAppOptions = {}): TestApp | Promise<TestApp> {
  const inspector = createTestInspector();
  const { autoStart, overrides, strictActions, ...createOptions } = options;
  const app = createAppInternal({
    ...createOptions,
    devOptions: {
      ...createOptions.devOptions,
      ...(strictActions === undefined ? {} : { strictActions }),
    },
    ...(overrides === undefined ? {} : { overrides }),
    testInspector: inspector,
  }) as TestApp;

  Object.defineProperty(app, "test", {
    configurable: false,
    enumerable: false,
    value: inspector,
  });

  if (autoStart === true) {
    return app.start().then(() => app);
  }

  return app;
}

function defaultFlushEffects(): Promise<void> {
  return Promise.resolve();
}

function createTestInspector(): MutableTestInspector {
  const actions: ActionEvent[] = [];
  const patches: unknown[] = [];
  let flushEffects = defaultFlushEffects;
  let lastState: unknown;

  return {
    clearActions() {
      actions.length = 0;
    },
    clearPatches() {
      patches.length = 0;
    },
    flushEffects() {
      return flushEffects();
    },
    getActions() {
      return actions;
    },
    getPatches() {
      return patches;
    },
    getState() {
      return lastState;
    },
    recordAction(event) {
      actions.push(event);
    },
    recordPatch(patch) {
      patches.push(patch);
    },
    recordState(state) {
      lastState = state;
    },
    setFlushEffects(callback) {
      flushEffects = callback;
    },
  };
}
