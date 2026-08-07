import { CoexistError } from "./errors.js";

/**
 * Serializes writes that arrive while the store is already committing.
 *
 * A watch listener or plugin hook can write state while it is being notified
 * about a write. Letting that reenter the store would interleave two commits
 * and publish a state no action ever produced, so such a write is queued and
 * replayed once the current commit — and its notifications — finish.
 *
 * The depth counters, the queue, and the reentrancy flag only mean anything
 * together: a caller that reads one without the others cannot tell whether a
 * write is safe. They lived on `RuntimeApp` as four separate fields touched
 * from seven methods; here the rule is one object's invariant.
 */
export class MutationScheduler {
  readonly #maxQueuedMutations: number;
  readonly #pending: (() => unknown)[] = [];
  #storeMutationDepth = 0;
  #notificationDepth = 0;
  #flushing = false;

  constructor(maxQueuedMutations: number) {
    this.#maxQueuedMutations = maxQueuedMutations;
  }

  /** Whether a write must be deferred instead of reaching the store now. */
  get shouldQueue(): boolean {
    return this.#storeMutationDepth > 0 || this.#notificationDepth > 0;
  }

  enqueue(mutation: () => unknown): void {
    this.#pending.push(mutation);
  }

  /**
   * Runs a store commit. Writes queued while it runs are replayed afterwards;
   * writes queued before it threw are discarded, because they were only
   * scheduled by work that did not complete.
   */
  runStoreMutation<T>(mutation: () => T): T {
    const pendingStart = this.#pending.length;
    let completed = false;
    this.#storeMutationDepth += 1;

    try {
      const result = mutation();
      completed = true;
      return result;
    } catch (error) {
      this.#pending.splice(pendingStart);
      throw error;
    } finally {
      this.#storeMutationDepth -= 1;

      if (completed) {
        this.flush();
      }
    }
  }

  /** Runs listener notification, deferring any write a listener makes. */
  runNotification(notify: () => void): void {
    this.#notificationDepth += 1;

    try {
      notify();
    } finally {
      this.#notificationDepth -= 1;
    }
  }

  /**
   * Replays queued writes. Each one may queue more — that is the point — but a
   * listener that re-triggers itself would otherwise spin forever, so the
   * cascade is capped and reported rather than hanging the app.
   */
  flush(): void {
    if (this.#flushing || this.shouldQueue) {
      return;
    }

    this.#flushing = true;

    try {
      let iterations = 0;

      while (this.#pending.length > 0) {
        iterations += 1;

        if (iterations > this.#maxQueuedMutations) {
          this.#pending.length = 0;
          throw new CoexistError(
            `Aborted a mutation cascade after ${this.#maxQueuedMutations} queued mutations; ` +
              "a watch listener or plugin hook is likely re-triggering itself.",
          );
        }

        const mutation = this.#pending.shift();

        if (mutation === undefined) {
          break;
        }

        const result = mutation();

        if (isPromiseLike(result)) {
          void Promise.resolve(result).catch(() => undefined);
        }
      }
    } catch (error) {
      this.#pending.length = 0;
      throw error;
    } finally {
      this.#flushing = false;
    }
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
