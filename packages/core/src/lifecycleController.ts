/**
 * The app's lifecycle state, in one place.
 *
 * It used to live in five booleans and four promise fields on `RuntimeApp`
 * (`isInitialized`, `isStarted`, `shouldBeStarted`, `isDisposing`,
 * `isDisposed`, plus the init/start/stop/transition promises), read and written
 * from a dozen methods. Nothing stopped a combination that cannot happen —
 * `isDisposed` without `isDisposing` cleared, say — and every new branch had to
 * re-derive which combinations were legal.
 *
 * Here the same machine is one object with a named `phase`, so an invariant is
 * checked once rather than re-argued at each call site, and the sequencing
 * rules (concurrent starts share a promise, opposite requests reconcile in
 * order, disposal is terminal) are readable in isolation.
 */
export type AppPhase = "created" | "disposed" | "disposing" | "started" | "starting" | "stopping";

export interface AppLifecycleHandlers {
  /** Runs module `onStart` hooks. Resolves once the app is started. */
  start(): Promise<void>;
  /** Runs module `onStop` hooks. Resolves once the app is stopped. */
  stop(): Promise<void>;
  /** Releases everything the app owns. Runs at most once. */
  dispose(): Promise<void>;
}

export class AppLifecycleController {
  readonly #handlers: AppLifecycleHandlers;

  #initPromise: Promise<void> = Promise.resolve();
  #startPromise: Promise<void> | undefined;
  #stopPromise: Promise<void> | undefined;
  #disposePromise: Promise<void> | undefined;
  #transition: Promise<void> | undefined;
  #initialized = false;
  #started = false;
  /** What the caller last asked for; reconciled against `#started`. */
  #shouldBeStarted = false;
  #disposal: "begun" | "finished" | undefined;

  constructor(handlers: AppLifecycleHandlers) {
    this.#handlers = handlers;
  }

  get phase(): AppPhase {
    if (this.#disposal !== undefined) {
      return this.#disposal === "finished" ? "disposed" : "disposing";
    }

    if (this.#startPromise !== undefined) {
      return "starting";
    }

    if (this.#stopPromise !== undefined) {
      return "stopping";
    }

    return this.#started ? "started" : "created";
  }

  get started(): boolean {
    return this.#started;
  }

  /** Whether plugin setup, `onInit`, and effect startup have all completed. */
  get initialized(): boolean {
    return this.#initialized;
  }

  get stopping(): boolean {
    return this.#stopPromise !== undefined;
  }

  /** True from the moment disposal begins — the point after which the app is terminal. */
  get disposalBegun(): boolean {
    return this.#disposal !== undefined;
  }

  get disposed(): boolean {
    return this.#disposal === "finished";
  }

  get initPromise(): Promise<void> {
    return this.#initPromise;
  }

  /** The in-flight start, so disposal can wait for it to settle. */
  get startPromise(): Promise<void> | undefined {
    return this.#startPromise;
  }

  beginInit(run: () => Promise<void>): void {
    this.#initPromise = Promise.resolve().then(run);
    // Observed here so an app that is never started or awaited does not emit an
    // unhandled rejection; callers still see the failure through `initPromise`.
    this.#initPromise.catch(() => undefined);
  }

  markInitialized(): void {
    this.#initialized = true;
  }

  requestStart(): Promise<void> {
    this.#shouldBeStarted = true;

    if (this.#started && this.#transition === undefined) {
      return Promise.resolve();
    }

    return this.#transitionLifecycle();
  }

  requestStop(): Promise<void> {
    this.#shouldBeStarted = false;

    if (!this.#started && this.#transition === undefined) {
      return Promise.resolve();
    }

    return this.#transitionLifecycle();
  }

  requestDispose(): Promise<void> {
    this.#disposePromise ??= this.#handlers.dispose();
    return this.#disposePromise;
  }

  /** Records that module `onStart` hooks completed. */
  markStarted(): void {
    this.#started = true;
  }

  /** Releases the shared start promise once a start attempt settles. */
  finishStart(): void {
    this.#startPromise = undefined;
  }

  /** Records that the app is stopped and releases the shared stop promise. */
  markStopped(): void {
    this.#started = false;
    this.#stopPromise = undefined;
  }

  beginDisposal(): void {
    this.#disposal ??= "begun";
  }

  finishDisposal(): void {
    this.#started = false;
    this.#disposal = "finished";
  }

  #transitionLifecycle(): Promise<void> {
    this.#transition ??= this.#reconcile();
    return this.#transition;
  }

  /**
   * Drives the app toward the last requested state. Opposite requests issued
   * while a transition is in flight are honoured in order rather than racing:
   * `start(); stop()` always ends stopped.
   */
  async #reconcile(): Promise<void> {
    try {
      while (this.#shouldBeStarted !== this.#started) {
        if (this.#shouldBeStarted) {
          this.#startPromise ??= this.#handlers.start();
          // eslint-disable-next-line no-await-in-loop -- Opposite lifecycle requests must run in order.
          await this.#startPromise;
        } else {
          this.#stopPromise ??= this.#handlers.stop();
          // eslint-disable-next-line no-await-in-loop -- Opposite lifecycle requests must run in order.
          await this.#stopPromise;
        }
      }
    } catch (error) {
      // A failed transition leaves the app where it actually is, not where it
      // was asked to be, so the next request starts from the truth.
      this.#shouldBeStarted = this.#started;
      throw error;
    } finally {
      this.#transition = undefined;
    }
  }
}
