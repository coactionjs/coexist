import { describe, expect, it } from "vitest";

import { createApp, defineModule } from "./index.js";

/**
 * Model-based lifecycle testing. `start`, `stop`, `ready`, and `dispose` can
 * interleave, be re-entered, and race each other, so the number of reachable
 * state combinations grows faster than hand-written cases can cover. This runs
 * random command sequences and checks the invariants that must hold after every
 * one of them:
 *
 * 1. `onStart` and `onStop` stay balanced — a started module has exactly one
 *    unmatched `onStart`, a stopped one has none.
 * 2. `app.started` agrees with those hooks.
 * 3. Disposal is terminal: `onDispose` runs once, and nothing restarts after it.
 * 4. No command leaves an unhandled rejection behind.
 *
 * The generator is seeded, so a failure reproduces from the seed in its name.
 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

type LifecycleCommand = "dispose" | "ready" | "start" | "stop";

const commands: readonly LifecycleCommand[] = ["start", "stop", "ready", "dispose"];

describe("app lifecycle model", () => {
  for (const seed of [3, 11, 29, 101, 4096]) {
    it(`keeps lifecycle invariants under random command sequences (seed ${seed})`, async () => {
      const random = createRandom(seed);
      const rejections: unknown[] = [];
      const onUnhandledRejection = (error: unknown) => {
        rejections.push(error);
      };

      let starts = 0;
      let stops = 0;
      let disposes = 0;

      class LifecycleProbe {
        value = 0;

        onStart(): void {
          starts += 1;
        }

        onStop(): void {
          stops += 1;
        }

        onDispose(): void {
          disposes += 1;
        }
      }

      defineModule(LifecycleProbe, {
        name: `lifecycleProbe${seed}`,
        state: ["value"],
      });

      const app = createApp({ providers: [LifecycleProbe] });
      let disposed = false;

      process.on("unhandledRejection", onUnhandledRejection);

      const observations: {
        command: LifecycleCommand;
        unmatchedStarts: number;
        expectedUnmatchedStarts: number;
        startedAfterDisposal: boolean;
        disposeCallsAfterDisposal: number | undefined;
      }[] = [];

      try {
        for (let index = 0; index < 12; index += 1) {
          const command = commands[Math.floor(random() * commands.length)] as LifecycleCommand;

          // A rejection is a legitimate outcome — starting after disposal, for
          // instance. Only the invariants afterwards have to hold.
          // eslint-disable-next-line no-await-in-loop -- the point is a sequence, not a batch.
          await runCommand(command).catch(() => undefined);

          if (command === "dispose") {
            disposed = true;
          }

          observations.push({
            command,
            disposeCallsAfterDisposal: disposed ? disposes : undefined,
            expectedUnmatchedStarts: app.started ? 1 : 0,
            startedAfterDisposal: disposed && app.started,
            unmatchedStarts: starts - stops,
          });
        }

        expect(
          observations.filter(
            (observation) => observation.unmatchedStarts !== observation.expectedUnmatchedStarts,
          ),
        ).toEqual([]);
        expect(observations.filter((observation) => observation.startedAfterDisposal)).toEqual([]);
        expect(
          observations.filter(
            (observation) =>
              observation.disposeCallsAfterDisposal !== undefined &&
              observation.disposeCallsAfterDisposal !== 1,
          ),
        ).toEqual([]);

        await app.dispose().catch(() => undefined);

        expect(app.started).toBe(false);
        expect(starts).toBe(stops);
        expect(disposes).toBe(1);
        await expect(app.start()).rejects.toThrow("Cannot start an app after disposal.");

        // Let any deferred rejection surface before asserting there were none.
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(rejections).toEqual([]);
      } finally {
        process.off("unhandledRejection", onUnhandledRejection);
      }

      function runCommand(command: LifecycleCommand): Promise<unknown> {
        switch (command) {
          case "dispose": {
            return app.dispose();
          }

          case "ready": {
            return app.ready;
          }

          case "start": {
            return app.start();
          }

          default: {
            return app.stop();
          }
        }
      }
    });
  }

  it("balances lifecycle hooks when start and stop are issued concurrently", async () => {
    let starts = 0;
    let stops = 0;

    class ConcurrentProbe {
      value = 0;

      async onStart(): Promise<void> {
        await Promise.resolve();
        starts += 1;
      }

      async onStop(): Promise<void> {
        await Promise.resolve();
        stops += 1;
      }
    }

    defineModule(ConcurrentProbe, {
      name: "concurrentLifecycleProbe",
      state: ["value"],
    });

    const app = createApp({ providers: [ConcurrentProbe] });

    await Promise.all([app.start(), app.stop(), app.start(), app.stop()]);

    expect(app.started).toBe(false);
    expect(starts).toBe(stops);

    await app.dispose();
  });
});
