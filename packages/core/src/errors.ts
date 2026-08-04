export class CoexistError extends Error {
  constructor(message: string) {
    super(message);
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
