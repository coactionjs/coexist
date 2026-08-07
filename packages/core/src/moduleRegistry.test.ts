import { describe, expect, it } from "vitest";

import { ModuleRegistry, type ModuleBindingLike } from "./moduleRegistry.js";
import { token } from "./index.js";

interface TestBinding extends ModuleBindingLike {
  readonly id: string;
}

function binding(name: string, id = name): TestBinding {
  return { id, name, token: token(name) };
}

describe("module registry", () => {
  it("indexes constructor modules by both token and name", () => {
    const counter = binding("counter");
    const todos = binding("todos");
    const registry = new ModuleRegistry([counter, todos]);

    expect(registry.modules).toEqual([counter, todos]);
    expect(registry.getByToken(counter.token)).toBe(counter);
    expect(registry.getByName("todos")).toBe(todos);
    expect(registry.getByToken(token("absent"))).toBeUndefined();
    expect(registry.getByName("absent")).toBeUndefined();
  });

  it("appends added modules after the ones registered at creation", () => {
    const counter = binding("counter");
    const admin = binding("admin");
    const registry = new ModuleRegistry([counter]);

    registry.add([admin]);

    // Registration order is the lifecycle order, so a lazy module must land last.
    expect(registry.modules).toEqual([counter, admin]);
    expect(registry.getByName("admin")).toBe(admin);
  });

  it("removes a module from the list and both indexes", () => {
    const counter = binding("counter");
    const admin = binding("admin");
    const registry = new ModuleRegistry([counter, admin]);

    registry.remove([admin]);

    expect(registry.modules).toEqual([counter]);
    expect(registry.getByToken(admin.token)).toBeUndefined();
    expect(registry.getByName("admin")).toBeUndefined();
  });

  it("leaves a replacement in place when removing the binding it replaced", () => {
    const original = binding("counter", "original");
    const registry = new ModuleRegistry([original]);
    const replacement: TestBinding = {
      id: "replacement",
      name: original.name,
      token: original.token,
    };

    registry.add([replacement]);
    // A failed lazy load rolls back its own binding. The indexes now point at
    // the replacement, so removing the original must not unregister it.
    registry.remove([original]);

    expect(registry.getByToken(original.token)).toBe(replacement);
    expect(registry.getByName("counter")).toBe(replacement);
    expect(registry.modules).toEqual([replacement]);
  });

  it("ignores removal of a module it never held", () => {
    const counter = binding("counter");
    const registry = new ModuleRegistry([counter]);

    expect(() => registry.remove([binding("stranger")])).not.toThrow();
    expect(registry.modules).toEqual([counter]);
  });

  it("rejects a module whose token is already registered", () => {
    const counter = binding("counter");
    const registry = new ModuleRegistry([counter]);
    const sameToken: TestBinding = { id: "other", name: "otherName", token: counter.token };

    expect(() => registry.assertAbsent([sameToken])).toThrow("Duplicate non-multi provider");
  });

  it("rejects a module whose name is already registered", () => {
    const registry = new ModuleRegistry([binding("counter")]);
    // A distinct token but the same name still collides: the name keys the
    // store slice, persistence, and worker RPC.
    const sameName = binding("counter", "different");

    expect(() => registry.assertAbsent([sameName])).toThrow("Duplicate non-multi provider");
  });

  it("accepts modules that collide with neither index", () => {
    const registry = new ModuleRegistry([binding("counter")]);

    expect(() => registry.assertAbsent([binding("todos"), binding("admin")])).not.toThrow();
  });
});
