import { createReactiveTracker } from "coaction/adapter";

/**
 * Bookkeeping for running module effects: their reactive trackers, their
 * teardown order, and the async runs still in flight.
 *
 * `RuntimeApp` still decides what running one effect means — the managed
 * execution context, the injection scope, the error phase — but it no longer
 * also holds the disposer list and the pending-promise set. Lazy-module
 * rollback depends on being able to stop only the effects a failed load
 * started and wait only for the runs it created, which is easier to state, and
 * to get right, when that bookkeeping is one object.
 */
export interface EffectRunner {
  /** Executes one effect body. Returns a promise for an async effect. */
  run(): unknown;
  /** Reports a failure the effect could not handle itself. */
  reportError(error: unknown, phase: string): void;
}

export class EffectRuntime {
  readonly #disposers: (() => void)[] = [];
  readonly #pending = new Set<Promise<void>>();

  /** How many effects are running, so a caller can stop only later ones. */
  get size(): number {
    return this.#disposers.length;
  }

  /** The runs in flight right now, as a baseline for a later rollback. */
  snapshotPending(): ReadonlySet<Promise<void>> {
    return new Set(this.#pending);
  }

  /**
   * Starts one effect and tracks it. A failure during the first run tears the
   * tracker down before rethrowing, so a half-subscribed effect is never left
   * behind.
   */
  start(runner: EffectRunner): void {
    const tracker = createReactiveTracker();
    let disposed = false;

    const run = () => {
      if (disposed) {
        return;
      }

      try {
        tracker.track(() => {
          this.#track(runner);
        });
      } catch (error) {
        runner.reportError(error, "effect");
        throw error;
      }
    };

    const unsubscribe = tracker.subscribe(() => {
      try {
        run();
      } catch {
        // The error has already been emitted through plugin hooks.
      }
    });

    const dispose = () => {
      disposed = true;
      unsubscribe();
      tracker.dispose();
    };

    try {
      run();
    } catch (error) {
      try {
        dispose();
      } catch (disposeError) {
        // eslint-disable-next-line preserve-caught-error -- AggregateError.errors and cause both retain the startup failure.
        throw new AggregateError([error, disposeError], "Effect startup and cleanup failed.", {
          cause: error,
        });
      }

      throw error;
    }

    this.#disposers.push(dispose);
  }

  stopAll(): void {
    this.stopFrom(0);
  }

  /** Stops every effect started at or after `index`, in reverse order. */
  stopFrom(index: number): void {
    const errors: unknown[] = [];

    for (const dispose of this.#disposers.splice(index).toReversed()) {
      try {
        dispose();
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, "One or more effects failed to stop.");
    }
  }

  /**
   * Waits for every async run to settle. Settling runs may schedule more, so
   * this drains rather than awaiting one snapshot.
   */
  async waitForPending(): Promise<void> {
    const errors: unknown[] = [];

    while (this.#pending.size > 0) {
      // eslint-disable-next-line no-await-in-loop -- async effects may enqueue follow-up effects while settling.
      const results = await Promise.allSettled(this.#pending);

      for (const result of results) {
        if (result.status === "rejected") {
          errors.push(result.reason);
        }
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, "One or more pending effects failed while disposing.");
    }
  }

  /** Waits only for the runs started after `baseline`, for a staged rollback. */
  async waitForPendingCreatedAfter(baseline: ReadonlySet<Promise<void>>): Promise<void> {
    const pending = [...this.#pending].filter((run) => !baseline.has(run));
    const results = await Promise.allSettled(pending);
    const errors = results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => result.reason);

    if (errors.length > 0) {
      throw new AggregateError(errors, "One or more staged effects failed while rolling back.");
    }
  }

  #track(runner: EffectRunner): void {
    const result = runner.run();

    if (!isPromiseLike(result)) {
      return;
    }

    const pending = Promise.resolve(result)
      .then(() => undefined)
      .catch((error: unknown) => {
        runner.reportError(error, "run");
        throw error;
      })
      .finally(() => {
        this.#pending.delete(pending);
      });

    this.#pending.add(pending);
    pending.catch(() => undefined);
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}
