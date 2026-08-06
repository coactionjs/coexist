import { afterEach, describe, expect, it } from "vitest";

import { defineModule, provide } from "@coexist/core";
import { testApp, type TestApp } from "@coexist/testing";

abstract class Logger {
  abstract info(message: string): void;
}

class MemoryLogger implements Logger {
  readonly messages: string[] = [];

  info(message: string): void {
    this.messages.push(message);
  }
}

class Counter {
  count = 0;
  readonly observed: number[] = [];

  constructor(readonly logger: Logger) {}

  get double(): number {
    return this.count * 2;
  }

  increase(step = 1): void {
    this.count += step;
    this.logger.info(`count:${this.count}`);
  }

  // An effect reacts to state; it must not write state, or every commit it
  // causes would re-trigger it.
  recordCount(): void {
    this.observed.push(this.count);
  }
}

defineModule(Counter, {
  actions: ["increase"],
  computed: ["double"],
  deps: [Logger],
  effects: ["recordCount"],
  name: "counter",
  state: ["count"],
});

let app: TestApp | undefined;

afterEach(async () => {
  await app?.dispose();
  app = undefined;
});

describe("testApp", () => {
  it("overrides providers and records action/state assertions", () => {
    const logger = new MemoryLogger();
    app = testApp({
      overrides: [provide(Logger, { useValue: logger })],
      providers: [Counter, provide(Logger, { useValue: console })],
      strictActions: true,
    });

    const counter = app.getModule(Counter);

    counter.increase(2);

    expect(counter.double).toBe(4);
    expect(logger.messages).toEqual(["count:2"]);
    expect(app.test.getActions()).toMatchObject([
      {
        method: "increase",
        module: "counter",
      },
    ]);
    expect(app.test.getState()).toEqual({
      counter: {
        count: 2,
      },
    });
  });

  it("runs effects after init and again after each committed change", async () => {
    app = testApp({
      providers: [Counter, provide(Logger, { useValue: new MemoryLogger() })],
    });

    const counter = app.getModule(Counter);

    await app.ready;
    await app.test.flushEffects();

    // Effects run once during initialization, before any action.
    expect(counter.observed).toEqual([0]);

    counter.increase(2);
    await app.test.flushEffects();

    expect(counter.observed).toEqual([0, 2]);

    // One action commits once, however many fields it writes.
    counter.increase(1);
    counter.increase(1);
    await app.test.flushEffects();

    expect(counter.observed).toEqual([0, 2, 3, 4]);
  });
});
