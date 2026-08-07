import { describe, expect, it } from "vitest";

import { DecoratorFixture, FixtureLogger } from "./decorators.fixture.js";
import { Action, Computed, Effect, provide, State, testApp } from "./index.js";

/**
 * Each decorator guards the kind of member it was applied to. A build that
 * lowers decorators differently — or a hand-written call — can reach these
 * paths, and the message is the only thing telling the author what went wrong.
 */
describe("decorator target guards", () => {
  it("rejects @State on anything but a standard accessor", () => {
    expect(() => State(undefined as never, { kind: "field", name: "count" } as never)).toThrow(
      "@State only supports standard accessor decorators.",
    );
  });

  it("rejects @Action on anything but a method", () => {
    expect(() => Action(undefined as never, { kind: "getter", name: "double" } as never)).toThrow(
      "@Action only supports method decorators.",
    );
  });

  it("rejects @Computed on anything but a getter", () => {
    expect(() => Computed(undefined as never, { kind: "method", name: "double" } as never)).toThrow(
      "@Computed only supports getter decorators.",
    );
  });

  it("rejects @Effect on anything but a method", () => {
    expect(() => Effect(undefined as never, { kind: "field", name: "sync" } as never)).toThrow(
      "@Effect only supports method decorators.",
    );
  });
});

describe("standard decorators end-to-end", () => {
  it("binds @State, @Computed, and @Action through a live app", () => {
    const messages: string[] = [];
    const app = testApp({
      providers: [
        DecoratorFixture,
        provide(FixtureLogger, {
          useValue: {
            info(message: string): void {
              messages.push(message);
            },
          },
        }),
      ],
    });
    const fixture = app.getModule(DecoratorFixture);

    expect(fixture.count).toBe(0);
    expect(fixture.double).toBe(0);
    expect(app.store.getPureState()).toEqual({ decoratorFixture: { count: 0 } });

    fixture.increase(2);

    expect(fixture.count).toBe(2);
    expect(fixture.double).toBe(4);
    expect(messages).toEqual(["2"]);
    expect(app.store.getPureState()).toEqual({ decoratorFixture: { count: 2 } });
    expect(app.test.getActions()).toMatchObject([
      {
        method: "increase",
        module: "decoratorFixture",
      },
    ]);
  });

  it("enforces strict action writes on decorated state", () => {
    const app = testApp({
      providers: [
        DecoratorFixture,
        provide(FixtureLogger, {
          useValue: {
            info(): void {},
          },
        }),
      ],
      strictActions: true,
    });
    const fixture = app.getModule(DecoratorFixture);

    expect(() => {
      fixture.count = 5;
    }).toThrow(/outside an action/);

    fixture.increase();

    expect(fixture.count).toBe(1);
  });
});
