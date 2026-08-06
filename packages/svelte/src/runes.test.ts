import { afterEach, describe, expect, it } from "vitest";

import {
  createApp,
  createMemoryWorkerTransportPair,
  createWorkerApp,
  createWorkerClient,
  defineModule,
} from "@coexist/core";

import { clearCoexistApp, clearWorkerClient, setCoexistApp, setWorkerClient } from "./index.js";
import {
  moduleRune,
  selectedModuleRune,
  selectorRune,
  workerModuleRune,
  workerSelectorRune,
} from "./runes.js";

class RuneCounter {
  count = 0;

  get double(): number {
    return this.count * 2;
  }

  increase(step = 1): void {
    this.count += step;
  }
}

defineModule(RuneCounter, {
  actions: ["increase"],
  computed: ["double"],
  name: "svelteRuneCounter",
  state: ["count"],
});

describe("Svelte rune helpers", () => {
  afterEach(() => {
    clearCoexistApp();
    clearWorkerClient();
  });

  it("exposes module instances through Svelte 5 friendly rune objects", () => {
    const app = createApp({
      providers: [RuneCounter],
    });
    setCoexistApp(app);
    const counter = moduleRune(RuneCounter);

    counter.current.increase(2);

    expect(counter.current.count).toBe(2);
    expect(counter.value).toBe(counter.current);
    expect(counter.get()).toBe(counter.current);
  });

  it("reads selected values from the app with equality support", () => {
    const app = createApp({
      providers: [RuneCounter],
    });
    const counter = app.getModule(RuneCounter);
    const parity = selectorRune(
      (currentApp) => ({
        value: currentApp.getModule(RuneCounter).count % 2,
      }),
      {
        app,
        equals: (value, previous) => value.value === previous.value,
      },
    );
    const first = parity.current;

    counter.increase(2);

    expect(parity.current).toBe(first);

    counter.increase(1);

    expect(parity.current).toEqual({ value: 1 });
  });

  it("exposes selected module values through rune objects", () => {
    const app = createApp({
      providers: [RuneCounter],
    });
    const counter = app.getModule(RuneCounter);
    const double = selectedModuleRune(RuneCounter, (module) => module.double, { app });

    counter.increase(3);

    expect(double.current).toBe(6);
  });

  it("reads worker-hosted state through Svelte 5 friendly rune objects", async () => {
    const [hostTransport, clientTransport] = createMemoryWorkerTransportPair();
    const client = createWorkerClient({
      transport: clientTransport,
    });
    const host = createWorkerApp({
      providers: [RuneCounter],
      sync: "patch",
      transport: hostTransport,
    });

    await client.ready;

    const counter = workerModuleRune<RuneCounter>("svelteRuneCounter", { client });
    const count = workerSelectorRune(
      (state) => (state as WorkerRuneCounterState).svelteRuneCounter.count,
      { client },
    );

    expect(count.current).toBe(0);

    await counter.current.increase(4);

    expect(count.current).toBe(4);

    client.dispose();
    await host.dispose();
  });

  it("exposes current, value, and get() as the same read on every rune", () => {
    const app = createApp({
      providers: [RuneCounter],
    });
    setCoexistApp(app);

    const counter = moduleRune(RuneCounter);
    const count = selectorRune((currentApp) => currentApp.getModule(RuneCounter).count);
    const double = selectedModuleRune(RuneCounter, (module) => module.double);

    expect(counter.value).toBe(counter.current);
    expect(counter.get()).toBe(counter.current);
    expect([count.current, count.value, count.get()]).toEqual([0, 0, 0]);
    expect([double.current, double.value, double.get()]).toEqual([0, 0, 0]);

    counter.current.increase(3);

    expect([count.current, count.value, count.get()]).toEqual([3, 3, 3]);
    expect([double.current, double.value, double.get()]).toEqual([6, 6, 6]);
  });

  it("holds a selector rune at its previous value while equals reports no change", () => {
    const app = createApp({
      providers: [RuneCounter],
    });
    setCoexistApp(app);

    const parity = selectorRune(
      (currentApp) => ({ even: currentApp.getModule(RuneCounter).count % 2 === 0 }),
      { equals: (value, previous) => value.even === previous.even },
    );
    const first = parity.current;

    app.getModule(RuneCounter).increase(2);

    // Still even, so the rune keeps the identity it already handed out.
    expect(parity.current).toBe(first);

    app.getModule(RuneCounter).increase(1);

    expect(parity.current).not.toBe(first);
    expect(parity.current.even).toBe(false);
  });

  it("resolves worker runes from the registered client when none is passed", async () => {
    const [hostTransport, clientTransport] = createMemoryWorkerTransportPair();
    const client = createWorkerClient({
      transport: clientTransport,
    });
    const host = createWorkerApp({
      providers: [RuneCounter],
      sync: "patch",
      transport: hostTransport,
    });

    await client.ready;
    setWorkerClient(client);

    const counter = workerModuleRune<RuneCounter>("svelteRuneCounter");
    const count = workerSelectorRune(
      (state) => (state as WorkerRuneCounterState).svelteRuneCounter.count,
      {},
    );

    expect(counter.value).toBe(counter.current);
    expect(counter.get()).toBe(counter.current);
    expect([count.current, count.value, count.get()]).toEqual([0, 0, 0]);

    await counter.current.increase(2);

    expect([count.current, count.value, count.get()]).toEqual([2, 2, 2]);

    client.dispose();
    await host.dispose();
  });
});

interface WorkerRuneCounterState {
  readonly svelteRuneCounter: {
    readonly count: number;
  };
}
