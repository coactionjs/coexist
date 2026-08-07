import { describe, expect, it } from "vitest";

import {
  Action,
  Computed,
  defineModule,
  Effect,
  getModuleMetadata,
  Module,
  State,
} from "./index.js";

describe("module metadata storage", () => {
  it("merges standard decorator context metadata into module metadata", () => {
    const metadata: Record<PropertyKey, unknown> = {};

    State(
      undefined as never,
      {
        addInitializer() {},
        kind: "accessor",
        metadata,
        name: "count",
        private: false,
        static: false,
      } as unknown as ClassAccessorDecoratorContext<object, number>,
    );
    Action(function increase() {}, {
      addInitializer() {},
      kind: "method",
      metadata,
      name: "increase",
      private: false,
      static: false,
    } as unknown as ClassMethodDecoratorContext<object, () => void>);
    Computed(
      function double() {
        return 0;
      },
      {
        addInitializer() {},
        kind: "getter",
        metadata,
        name: "double",
        private: false,
        static: false,
      } as unknown as ClassGetterDecoratorContext<object, number>,
    );
    Effect(function record() {}, {
      addInitializer() {},
      kind: "method",
      metadata,
      name: "record",
      private: false,
      static: false,
    } as unknown as ClassMethodDecoratorContext<object, () => void>);

    class Counter {
      readonly count = 0;
    }

    Module({ name: "metadataCounter" })(Counter, {
      addInitializer() {},
      kind: "class",
      metadata,
      name: "Counter",
    } as ClassDecoratorContext<typeof Counter>);

    const moduleMetadata = getModuleMetadata(Counter);

    expect(moduleMetadata?.name).toBe("metadataCounter");
    expect(moduleMetadata?.state.has("count")).toBe(true);
    expect(moduleMetadata?.actions.has("increase")).toBe(true);
    expect(moduleMetadata?.computed.has("double")).toBe(true);
    expect(moduleMetadata?.effects.has("record")).toBe(true);
  });

  it("rejects metadata that does not describe the class", () => {
    class TypedCounter {
      count = 0;
      label = "counter";

      get double(): number {
        return this.count * 2;
      }

      increase(step = 1): void {
        this.count += step;
      }
    }

    // A member the class declares is accepted, whatever its kind.
    defineModule(TypedCounter, {
      actions: ["increase"],
      computed: ["double"],
      name: "typedCounter",
      state: ["count", "label"],
    });

    defineModule(TypedCounter, {
      // A state key the class does not declare used to compile, and at runtime
      // gave the instance a reactive property reading `undefined`.
      // @ts-expect-error -- "cout" is not a member of TypedCounter.
      state: ["cout"],
    });

    defineModule(TypedCounter, {
      // @ts-expect-error -- "nope" is not a member of TypedCounter.
      actions: ["nope"],
    });

    defineModule(TypedCounter, {
      // A field is a member, but naming it as an action is still wrong: only
      // callable members can be actions or effects.
      // @ts-expect-error -- "count" is a field, not a method.
      actions: ["count"],
    });

    defineModule(TypedCounter, {
      // @ts-expect-error -- "label" is a field, not a method.
      effects: ["label"],
    });

    expect(getModuleMetadata(TypedCounter)?.name).toBe("typedCounter");
  });
});
