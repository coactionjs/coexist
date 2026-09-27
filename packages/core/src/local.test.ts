import { describe, expect, it } from "vitest";

import { CoexistError, createApp, defineModule } from "./local.js";

class LocalCounter {
  count = 0;

  increase(): void {
    this.count += 1;
  }
}

defineModule(LocalCounter, {
  actions: ["increase"],
  name: "localCounter",
  state: ["count"],
});

describe("local app entry", () => {
  it("publishes local state changes and disposes cleanly", async () => {
    const app = createApp({ providers: [LocalCounter] });
    const versions: number[] = [];
    const unwatch = app.watch(
      () => app.getModule(LocalCounter).count,
      (value) => versions.push(value),
    );

    await app.start();
    app.getModule(LocalCounter).increase();

    expect(app.store.getPureState()).toEqual({ localCounter: { count: 1 } });
    expect(versions).toEqual([1]);

    unwatch();
    await app.dispose();
  });

  it("rejects a shared-store transport", () => {
    expect(() =>
      createApp({ engine: { transport: {} } } as Parameters<typeof createApp>[0]),
    ).toThrowError(CoexistError);
  });
});
