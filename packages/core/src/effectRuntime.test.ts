import { describe, expect, it, vi } from "vitest";

import { EffectRuntime, type EffectRunner } from "./effectRuntime.js";

function runner(run: () => unknown, errors: [unknown, string][] = []): EffectRunner {
  return {
    run,
    reportError(error, phase) {
      errors.push([error, phase]);
    },
  };
}

describe("effect runtime", () => {
  it("runs an effect once on start and counts it", () => {
    const effects = new EffectRuntime();
    let runs = 0;

    effects.start(
      runner(() => {
        runs += 1;
      }),
    );

    expect(runs).toBe(1);
    expect(effects.size).toBe(1);
  });

  it("stops only the effects started at or after an index", () => {
    const effects = new EffectRuntime();
    const order: string[] = [];

    effects.start(runner(() => order.push("first")));
    const boundary = effects.size;
    effects.start(runner(() => order.push("second")));
    effects.start(runner(() => order.push("third")));

    effects.stopFrom(boundary);

    // A rolled-back lazy load stops what it started, newest first, and leaves
    // the app's existing effects running.
    expect(effects.size).toBe(boundary);
  });

  it("tears every effect down even when a disposer throws", async () => {
    const disposeFailure = new Error("tracker dispose failed");
    const disposed: number[] = [];
    let created = 0;

    vi.resetModules();
    vi.doMock("coaction/adapter", () => ({
      createReactiveTracker() {
        const index = created;
        created += 1;

        return {
          track: (callback: () => unknown) => callback(),
          subscribe: () => () => undefined,
          dispose() {
            disposed.push(index);

            // Only the middle tracker fails; the others must still be released.
            if (index === 1) {
              throw disposeFailure;
            }
          },
        };
      },
    }));

    const { EffectRuntime: MockedEffectRuntime } = await import("./effectRuntime.js");
    const effects = new MockedEffectRuntime();

    for (let index = 0; index < 3; index += 1) {
      effects.start(runner(() => undefined));
    }

    expect(() => effects.stopAll()).toThrow("One or more effects failed to stop.");
    // Reverse order, and the failure did not cut the loop short.
    expect(disposed).toEqual([2, 1, 0]);
    expect(effects.size).toBe(0);

    vi.doUnmock("coaction/adapter");
    vi.resetModules();
  });

  it("reports a synchronous failure and does not register the effect", () => {
    const effects = new EffectRuntime();
    const errors: [unknown, string][] = [];
    const failure = new Error("effect body failed");

    expect(() =>
      effects.start(
        runner(() => {
          throw failure;
        }, errors),
      ),
    ).toThrow(failure);

    expect(errors).toEqual([[failure, "effect"]]);
    // A half-subscribed effect must not be left behind.
    expect(effects.size).toBe(0);
  });

  it("surfaces a rejected async run through waitForPending", async () => {
    const effects = new EffectRuntime();
    const errors: [unknown, string][] = [];
    const failure = new Error("async effect failed");

    effects.start(runner(() => Promise.reject(failure), errors));

    await expect(effects.waitForPending()).rejects.toMatchObject({
      errors: [failure],
    });
    expect(errors).toEqual([[failure, "run"]]);
  });

  it("resolves waitForPending when every async run settles", async () => {
    const effects = new EffectRuntime();
    let resolved = false;

    effects.start(
      runner(async () => {
        await Promise.resolve();
        resolved = true;
      }),
    );

    await expect(effects.waitForPending()).resolves.toBeUndefined();
    expect(resolved).toBe(true);
  });

  it("waits only for runs started after a baseline", async () => {
    const effects = new EffectRuntime();
    const existingFailure = new Error("pre-existing failure");
    const stagedFailure = new Error("staged failure");
    let failExisting!: (error: unknown) => void;
    const existing = new Promise<void>((_resolve, reject) => {
      failExisting = reject;
    });

    existing.catch(() => undefined);
    effects.start(runner(() => existing));
    const baseline = effects.snapshotPending();
    effects.start(runner(() => Promise.reject(stagedFailure)));

    // Rollback must not adopt a failure that belonged to the app before it, nor
    // block on a pre-existing run that has not settled.
    await expect(effects.waitForPendingCreatedAfter(baseline)).rejects.toMatchObject({
      errors: [stagedFailure],
    });

    failExisting(existingFailure);

    await expect(effects.waitForPending()).rejects.toMatchObject({
      errors: [existingFailure],
    });
  });

  it("resolves waitForPendingCreatedAfter when the staged runs succeed", async () => {
    const effects = new EffectRuntime();

    effects.start(runner(() => Promise.resolve()));
    const baseline = effects.snapshotPending();
    effects.start(runner(() => Promise.resolve()));

    await expect(effects.waitForPendingCreatedAfter(baseline)).resolves.toBeUndefined();
    await expect(effects.waitForPending()).resolves.toBeUndefined();
  });

  it("does not re-run an effect after its scope is stopped", () => {
    const effects = new EffectRuntime();
    let runs = 0;
    let value = 0;

    effects.start(
      runner(() => {
        runs += 1;
        return value;
      }),
    );

    expect(runs).toBe(1);

    effects.stopAll();
    value += 1;

    expect(runs).toBe(1);
    expect(effects.size).toBe(0);
  });
});
