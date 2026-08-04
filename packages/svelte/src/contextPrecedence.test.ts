// Resolution-precedence tests for the exports in ./index.ts. They live in their
// own file because vi.mock("svelte") replaces the context API for the whole
// module, which the store and rune tests must observe unmocked.
import { describe, expect, it, vi } from "vitest";

import { createApp, createMemoryWorkerTransportPair, createWorkerClient } from "@coexist/core";

import {
  clearCoexistApp,
  clearWorkerClient,
  getCoexistApp,
  getWorkerClient,
  setCoexistApp,
  setCoexistContext,
  setWorkerClient,
  setWorkerClientContext,
} from "./index.js";

const context = vi.hoisted(() => new Map<unknown, unknown>());

vi.mock("svelte", () => ({
  getContext: (key: unknown) => context.get(key),
  hasContext: (key: unknown) => context.has(key),
  setContext: (key: unknown, value: unknown) => {
    context.set(key, value);
    return value;
  },
}));

describe("Svelte context resolution precedence", () => {
  it("prefers component context over the global default app", () => {
    const globalApp = createApp();
    const contextApp = createApp();

    setCoexistApp(globalApp);
    setCoexistContext(contextApp);

    expect(getCoexistApp()).toBe(contextApp);

    context.clear();

    expect(getCoexistApp()).toBe(globalApp);

    clearCoexistApp();

    expect(() => getCoexistApp()).toThrow(/Missing Coexist Svelte app/);
  });

  it("prefers component context over the global default worker client", () => {
    const [, globalTransport] = createMemoryWorkerTransportPair();
    const [, contextTransport] = createMemoryWorkerTransportPair();
    const globalClient = createWorkerClient({ transport: globalTransport });
    const contextClient = createWorkerClient({ transport: contextTransport });

    setWorkerClient(globalClient);
    setWorkerClientContext(contextClient);

    expect(getWorkerClient()).toBe(contextClient);

    context.clear();

    expect(getWorkerClient()).toBe(globalClient);

    clearWorkerClient();

    expect(() => getWorkerClient()).toThrow(/Missing Coexist Svelte worker client/);

    globalClient.dispose();
    contextClient.dispose();
  });
});
