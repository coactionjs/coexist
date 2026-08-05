import { describe, expect, it } from "vitest";

import {
  createMemoryWorkerTransportPair,
  createWorkerClient,
  type WorkerConflictEvent,
  type WorkerMessage,
} from "./index.js";

/**
 * Randomized protocol input. Hand-written cases cover the message shapes we
 * thought of; these cover the ones we did not — malformed envelopes, JSON
 * Pointer escapes, array bounds, prototype-polluting segments, and out-of-order
 * versions — and assert the invariants that must hold for *any* input:
 *
 * 1. A message never escapes as a thrown error; it is applied, reported
 *    invalid, or reported as a conflict.
 * 2. The mirror stays a plain object with a clean prototype.
 * 3. Nothing a peer sends can pollute `Object.prototype`.
 *
 * The generator is seeded, so a failure reproduces from the seed in its name.
 */
function createRandom(seed: number): () => number {
  // mulberry32: small, fast, and deterministic across platforms.
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const unsafeSegments = ["__proto__", "constructor", "prototype"];
const pathSegments = [
  "counter",
  "count",
  "items",
  "0",
  "1",
  "9007199254740993",
  "-1",
  "1.5",
  "",
  "~",
  "~0",
  "~1",
  "~2",
  ...unsafeSegments,
];
const patchOperations = ["add", "replace", "remove", "merge", "", null];

function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)] as T;
}

function createPatchPath(random: () => number): unknown {
  const depth = Math.floor(random() * 4);
  const segments = Array.from({ length: depth }, () => pick(random, pathSegments));

  if (random() < 0.3) {
    return segments.map((segment) => (random() < 0.5 ? Number(segment) : segment));
  }

  if (random() < 0.1) {
    return random() < 0.5 ? null : 42;
  }

  return segments.length === 0 ? "" : `/${segments.join("/")}`;
}

function createPatch(random: () => number): unknown {
  const operation = pick(random, patchOperations);
  const patch: Record<string, unknown> = {
    op: operation,
    path: createPatchPath(random),
  };

  if (operation !== "remove" || random() < 0.5) {
    patch.value = pick(random, [1, "text", null, true, { nested: 1 }, [1, 2], undefined]);
  }

  return patch;
}

function createMessage(random: () => number, version: number): unknown {
  const kind = random();

  if (kind < 0.15) {
    return pick(random, [
      null,
      undefined,
      42,
      "state",
      [],
      { type: "unknown" },
      { type: "state" },
      { type: "result" },
      { type: "sync" },
    ]);
  }

  if (kind < 0.3) {
    return {
      id: pick(random, [0, 1, -1, 1.5, "1", Number.NaN]),
      type: "result",
      value: { deep: { nested: true } },
      ...(random() < 0.5 ? { stateVersion: Math.floor(random() * 5) } : {}),
    };
  }

  if (kind < 0.4) {
    return { type: "ready" };
  }

  const patchCount = Math.floor(random() * 4);

  return {
    ...(random() < 0.5
      ? { state: pick(random, [{ counter: { count: 1 } }, {}, null, 5, [1], new Date(0)]) }
      : {}),
    ...(patchCount === 0
      ? {}
      : { patches: Array.from({ length: patchCount }, () => createPatch(random)) }),
    sync: pick(random, ["patch", "snapshot", "full", ""]),
    type: "state",
    version: pick(random, [version, version + 1, version - 1, -1, 1.5, "2"]),
  };
}

describe("worker protocol fuzzing", () => {
  for (const seed of [1, 7, 42, 1337, 90_210]) {
    it(`survives arbitrary protocol input (seed ${seed})`, () => {
      const random = createRandom(seed);
      const [hostTransport, clientTransport] = createMemoryWorkerTransportPair();
      const invalidMessages: unknown[] = [];
      const conflicts: WorkerConflictEvent[] = [];
      const client = createWorkerClient({
        onConflict(event) {
          conflicts.push(event);
        },
        onInvalidMessage(message) {
          invalidMessages.push(message);
        },
        // Recovery would post sync requests into a transport with no host and
        // leave timers running; this exercises message handling, not recovery.
        readyTimeout: 0,
        requestInitialSync: false,
        resync: false,
        transport: clientTransport,
      });
      const objectPrototypeKeys = Object.keys(Object.prototype).length;

      // Give the client a baseline so patch paths are exercised against real state.
      hostTransport.post({
        state: { counter: { count: 0 }, items: [1, 2, 3] },
        sync: "snapshot",
        type: "state",
        version: 1,
      });

      const snapshotPrototypes = new Set<unknown>();
      const versions: number[] = [];

      for (let index = 0; index < 400; index += 1) {
        const message = createMessage(random, client.state.version);

        expect(() => hostTransport.post(message as WorkerMessage)).not.toThrow();

        snapshotPrototypes.add(Object.getPrototypeOf(client.getState() ?? {}));
        versions.push(client.state.version);
      }

      expect([...snapshotPrototypes]).toEqual([Object.prototype]);
      expect(versions.filter((version) => !Number.isSafeInteger(version) || version < 0)).toEqual(
        [],
      );

      // Nothing a peer sent may reach the shared prototype.
      expect(Object.keys(Object.prototype)).toHaveLength(objectPrototypeKeys);
      expect(({} as Record<string, unknown>).count).toBeUndefined();
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();

      // The run must actually have exercised the rejection paths, otherwise the
      // generator drifted into only producing valid messages.
      expect(invalidMessages.length + conflicts.length).toBeGreaterThan(0);

      client.dispose();
    });
  }

  it("never lets a patch mutate the snapshot it was applied to", () => {
    const random = createRandom(2024);
    const [hostTransport, clientTransport] = createMemoryWorkerTransportPair();
    const client = createWorkerClient({
      readyTimeout: 0,
      requestInitialSync: false,
      resync: false,
      transport: clientTransport,
    });

    hostTransport.post({
      state: { counter: { count: 0 }, items: [1, 2, 3] },
      sync: "snapshot",
      type: "state",
      version: 1,
    });

    const mutatedInPlace: unknown[] = [];

    for (let index = 0; index < 200; index += 1) {
      const previous = client.getState();
      const frozen = structuredClone(previous);

      hostTransport.post({
        patches: [createPatch(random)],
        sync: "patch",
        type: "state",
        version: client.state.version + 1,
      });

      // A rejected patch must leave the old snapshot untouched, and an applied
      // one must produce a new object rather than edit the old one in place.
      const kept = client.getState() === previous;

      if (kept && JSON.stringify(previous) !== JSON.stringify(frozen)) {
        mutatedInPlace.push({ after: previous, before: frozen, index });
      }
    }

    expect(mutatedInPlace).toEqual([]);

    client.dispose();
  });
});
