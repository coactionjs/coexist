import { describe, expect, it } from "vitest";

import { createRuntimeAsyncContext } from "./async-context.js";

/**
 * `createRuntimeAsyncContext()` decides whether the runtime can attribute
 * suspended work to the app that started it. Every branch matters: the wrong
 * answer either loses lifecycle reentry detection across an `await` (Node) or
 * crashes on a runtime with no `node:async_hooks` (browsers, edge workers).
 */
describe("runtime async context detection", () => {
  const runtimeProcess = (globalThis as { process?: unknown }).process;

  function withProcess<T>(replacement: unknown, run: () => T): T {
    Object.defineProperty(globalThis, "process", {
      configurable: true,
      value: replacement,
      writable: true,
    });

    try {
      return run();
    } finally {
      Object.defineProperty(globalThis, "process", {
        configurable: true,
        value: runtimeProcess,
        writable: true,
      });
    }
  }

  it("uses AsyncLocalStorage when the host runtime provides it", () => {
    const context = createRuntimeAsyncContext<string>();

    expect(context).toBeDefined();
    expect(context?.run("scoped", () => context.getStore())).toBe("scoped");
    expect(context?.getStore()).toBeUndefined();
  });

  it("falls back when the runtime has no process at all", () => {
    expect(withProcess(undefined, () => createRuntimeAsyncContext())).toBeUndefined();
  });

  it("falls back when the runtime has no getBuiltinModule", () => {
    expect(withProcess({}, () => createRuntimeAsyncContext())).toBeUndefined();
  });

  it("falls back when node:async_hooks exists without AsyncLocalStorage", () => {
    const withoutStorage = { getBuiltinModule: () => ({}) };

    expect(withProcess(withoutStorage, () => createRuntimeAsyncContext())).toBeUndefined();
  });

  it("falls back when reading the builtin module throws", () => {
    // A runtime that exposes `getBuiltinModule` but refuses this specifier —
    // a permission-restricted sandbox, for instance — must not crash startup.
    const throwing = {
      getBuiltinModule() {
        throw new Error("module access denied");
      },
    };

    expect(withProcess(throwing, () => createRuntimeAsyncContext())).toBeUndefined();
  });
});
