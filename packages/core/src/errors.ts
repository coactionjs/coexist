export class CoexistError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CoexistError";
  }
}

export class FrozenContainerError extends CoexistError {
  constructor() {
    super("Container provider graph is frozen and can no longer be mutated.");
    this.name = "FrozenContainerError";
  }
}

export class DisposedContainerError extends CoexistError {
  constructor() {
    super("Container has been disposed and can no longer be used.");
    this.name = "DisposedContainerError";
  }
}

export class MissingProviderError extends CoexistError {
  constructor(token: string, path: readonly string[]) {
    super(
      [
        `Missing provider for ${token}.`,
        path.length > 0 ? "Resolution path:" : "",
        ...path.map((entry) => `  ${entry}`),
      ]
        .filter(Boolean)
        .join("\n"),
    );
    this.name = "MissingProviderError";
  }
}

export class DuplicateProviderError extends CoexistError {
  constructor(token: string) {
    super(`Duplicate non-multi provider for ${token}. Use override() or mark providers as multi.`);
    this.name = "DuplicateProviderError";
  }
}

export class AmbiguousProviderError extends CoexistError {
  constructor(token: string) {
    super(`Multiple providers registered for ${token}. Use getAll() instead of get().`);
    this.name = "AmbiguousProviderError";
  }
}

export class CircularDependencyError extends CoexistError {
  constructor(path: readonly string[]) {
    super(["Circular dependency detected:", ...path.map((entry) => `  ${entry}`)].join("\n"));
    this.name = "CircularDependencyError";
  }
}

export class AsyncProviderInSyncResolutionError extends CoexistError {
  constructor(token: string) {
    super(`Provider for ${token} resolved asynchronously. Use getAsync() instead of get().`);
    this.name = "AsyncProviderInSyncResolutionError";
  }
}

export class LifetimeLeakError extends CoexistError {
  constructor(parent: string, parentScope: string, child: string, childScope: string) {
    super(`${parent} (${parentScope}) cannot depend on ${child} (${childScope}) without leakSafe.`);
    this.name = "LifetimeLeakError";
  }
}

export class InjectContextError extends CoexistError {
  constructor(token: string) {
    super(`${token} can only be injected while resolving a provider or running an app hook.`);
    this.name = "InjectContextError";
  }
}

export class WorkerReadyTimeoutError extends CoexistError {
  constructor(timeout: number) {
    super(
      `Worker client did not receive an initial state snapshot within ${timeout}ms. ` +
        "Check that a worker host is running on the same transport, or raise readyTimeout.",
    );
    this.name = "WorkerReadyTimeoutError";
  }
}

export class WorkerHostUnavailableError extends CoexistError {
  constructor(reason: string) {
    super(`Worker host became unavailable before the initial state snapshot: ${reason}`);
    this.name = "WorkerHostUnavailableError";
  }
}

export class WorkerInitialSyncError extends CoexistError {
  constructor(cause: unknown) {
    super("Worker client could not request an initial state snapshot from its host.", { cause });
    this.name = "WorkerInitialSyncError";
  }
}
