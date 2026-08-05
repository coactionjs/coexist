import { DuplicateProviderError } from "./errors.js";
import { tokenName } from "./token.js";
import type { InjectionToken } from "./types.js";

/**
 * The app's modules, indexed the two ways the runtime looks them up.
 *
 * Registration order matters — lifecycle hooks run in it forwards and teardown
 * runs in it backwards — while `getModule(token)` and worker RPC by name need
 * constant-time lookup. Keeping the ordered list and both indexes in one object
 * means a lazy load or its rollback cannot update one and forget another;
 * previously all three lived on `RuntimeApp` and were mutated from four
 * different methods.
 *
 * Parent-app lookup deliberately stays on `RuntimeApp`: it has to re-check that
 * each app in the chain is still active, which is an app concern, not an index.
 */
export interface ModuleBindingLike {
  readonly name: string;
  readonly token: InjectionToken;
}

export class ModuleRegistry<TBinding extends ModuleBindingLike> {
  readonly #modules: TBinding[];
  readonly #byToken = new Map<InjectionToken, TBinding>();
  readonly #byName = new Map<string, TBinding>();

  constructor(modules: TBinding[]) {
    this.#modules = modules;

    for (const binding of modules) {
      this.#index(binding);
    }
  }

  /** Registration order — forwards for startup, reversed for teardown. */
  get modules(): readonly TBinding[] {
    return this.#modules;
  }

  getByToken(token: InjectionToken): TBinding | undefined {
    return this.#byToken.get(token);
  }

  getByName(name: string): TBinding | undefined {
    return this.#byName.get(name);
  }

  add(modules: readonly TBinding[]): void {
    for (const binding of modules) {
      this.#modules.push(binding);
      this.#index(binding);
    }
  }

  /** Removes modules a failed lazy load had already registered. */
  remove(modules: readonly TBinding[]): void {
    for (const binding of modules) {
      if (this.#byToken.get(binding.token) === binding) {
        this.#byToken.delete(binding.token);
      }

      if (this.#byName.get(binding.name) === binding) {
        this.#byName.delete(binding.name);
      }

      const index = this.#modules.indexOf(binding);

      if (index !== -1) {
        this.#modules.splice(index, 1);
      }
    }
  }

  /**
   * Rejects modules that would collide with a registered one, by token or by
   * name. Name collisions matter as much as token ones: the name keys the app
   * store slice, persistence, and worker RPC.
   */
  assertAbsent(modules: readonly TBinding[]): void {
    for (const binding of modules) {
      if (this.#byToken.has(binding.token)) {
        throw new DuplicateProviderError(tokenName(binding.token));
      }

      if (this.#byName.has(binding.name)) {
        throw new DuplicateProviderError(binding.name);
      }
    }
  }

  #index(binding: TBinding): void {
    this.#byToken.set(binding.token, binding);
    this.#byName.set(binding.name, binding);
  }
}
