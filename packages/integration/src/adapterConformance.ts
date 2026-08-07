import { describe, expect, it } from "vitest";

import {
  createApp,
  createMemoryWorkerTransportPair,
  createWorkerApp,
  createWorkerClient,
  defineModule,
  type App,
  type WorkerClient,
} from "@coexist/core";

/**
 * A behaviour contract every UI adapter must satisfy.
 *
 * The adapters share no implementation — each is written in its host
 * framework's idiom — so nothing stops one of them from quietly drifting away
 * from the others. This spec pins down the semantics that must be identical
 * regardless of idiom, and each adapter supplies only the binding that connects
 * it to the spec.
 */
export class ConformanceCounter {
  count = 0;

  increase(step = 1): void {
    this.count += step;
  }
}

defineModule(ConformanceCounter, {
  actions: ["increase"],
  name: "adapterConformanceCounter",
  state: ["count"],
});

export interface AdapterObservation {
  /** The module facade the adapter resolved. */
  readonly module: ConformanceCounter;
  /** The most recent value the adapter's selector produced. */
  read(): number;
  /** Tears down the adapter's scope: component tree, effect scope, injector. */
  dispose(): void;
}

export interface WorkerAdapterObservation {
  /** The async method proxy the adapter resolved. */
  readonly module: { increase(step?: number): Promise<unknown> };
  /** The most recent value the adapter's worker selector produced. */
  read(): number;
  dispose(): void;
}

export interface AdapterBinding {
  readonly name: string;
  /** Part of the error message raised when no app is available. */
  readonly missingAppMessage: string;
  /** Part of the error message raised when no worker client is available. */
  readonly missingClientMessage: string;
  /** Binds the adapter to `app` and starts observing `counter.count`. */
  observe(app: App): AdapterObservation;
  /** Resolves a module with no app registered. Must throw. */
  readWithoutApp(): unknown;
  /** Binds the adapter to `client` and starts observing the mirrored count. */
  observeWorker(client: WorkerClient): WorkerAdapterObservation;
  /** Resolves a worker module with no client registered. Must throw. */
  readWithoutClient(): unknown;
  /** Wraps a state change so the framework can flush its own scheduling. */
  runAction?(action: () => void): void;
  /** Awaits framework work scheduled by a resolved worker call. */
  flush?(): Promise<void>;
}

export function describeAdapterConformance(binding: AdapterBinding): void {
  const runAction = binding.runAction ?? ((action: () => void) => action());

  describe(`${binding.name} adapter conformance`, () => {
    it("resolves the facade the app owns rather than a copy", async () => {
      const app = createApp({ providers: [ConformanceCounter] });
      const observation = binding.observe(app);

      try {
        expect(observation.module).toBe(app.getModule(ConformanceCounter));
      } finally {
        observation.dispose();
        await app.dispose();
      }
    });

    it("starts from the current value and follows later actions", async () => {
      const app = createApp({ providers: [ConformanceCounter] });
      const counter = app.getModule(ConformanceCounter);

      runAction(() => {
        counter.increase(2);
      });

      const observation = binding.observe(app);

      try {
        // Binding after a change must show the change, not a stale initial value.
        expect(observation.read()).toBe(2);

        runAction(() => {
          counter.increase(3);
        });

        expect(observation.read()).toBe(5);
      } finally {
        observation.dispose();
        await app.dispose();
      }
    });

    it("keeps two apps observed at the same time isolated", async () => {
      const first = createApp({ providers: [ConformanceCounter] });
      const second = createApp({ providers: [ConformanceCounter] });
      const firstObservation = binding.observe(first);
      const secondObservation = binding.observe(second);

      try {
        runAction(() => {
          first.getModule(ConformanceCounter).increase(4);
        });

        // Two apps in one process must not share a module-global registration.
        expect(firstObservation.read()).toBe(4);
        expect(secondObservation.read()).toBe(0);
      } finally {
        firstObservation.dispose();
        secondObservation.dispose();
        await Promise.all([first.dispose(), second.dispose()]);
      }
    });

    it("stops following the app once its scope is disposed", async () => {
      const app = createApp({ providers: [ConformanceCounter] });
      const counter = app.getModule(ConformanceCounter);
      const observation = binding.observe(app);

      observation.dispose();

      try {
        runAction(() => {
          counter.increase(7);
        });

        // A disposed scope must have unsubscribed; the last value it saw stands.
        expect(observation.read()).toBe(0);
      } finally {
        await app.dispose();
      }
    });

    it("reports a missing app instead of returning undefined", () => {
      expect(() => binding.readWithoutApp()).toThrow(binding.missingAppMessage);
    });

    // The worker helpers are the half most likely to drift: they are used less,
    // they mirror state instead of owning it, and the runtime behind them is
    // still beta. Holding them to the same contract is what keeps one adapter
    // from quietly diverging while its app-side helpers stay correct.
    it("mirrors worker state and follows remote actions", async () => {
      const worker = await startWorkerHost();
      const observation = binding.observeWorker(worker.client);

      try {
        expect(observation.read()).toBe(0);

        await observation.module.increase(3);
        await binding.flush?.();

        expect(observation.read()).toBe(3);
      } finally {
        observation.dispose();
        await worker.dispose();
      }
    });

    it("stops mirroring worker state once its scope is disposed", async () => {
      const worker = await startWorkerHost();
      const observation = binding.observeWorker(worker.client);

      observation.dispose();

      try {
        await worker.client.module<ConformanceCounter>("adapterConformanceCounter").increase(5);
        await binding.flush?.();

        expect(observation.read()).toBe(0);
      } finally {
        await worker.dispose();
      }
    });

    it("reports a missing worker client instead of returning undefined", () => {
      expect(() => binding.readWithoutClient()).toThrow(binding.missingClientMessage);
    });
  });
}

interface ConformanceWorker {
  readonly client: WorkerClient;
  dispose(): Promise<void>;
}

async function startWorkerHost(): Promise<ConformanceWorker> {
  const [hostTransport, clientTransport] = createMemoryWorkerTransportPair();
  const client = createWorkerClient({ transport: clientTransport });
  const host = createWorkerApp({
    providers: [ConformanceCounter],
    transport: hostTransport,
  });

  // Worker selectors read the mirror synchronously, so nothing may bind before
  // the first snapshot has arrived.
  await client.ready;

  return {
    client,
    async dispose() {
      client.dispose();
      await host.dispose();
    },
  };
}
