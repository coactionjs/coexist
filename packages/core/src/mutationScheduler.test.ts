import { describe, expect, it } from "vitest";

import { MutationScheduler } from "./mutationScheduler.js";

describe("mutation scheduler", () => {
  it("lets a write through when nothing is committing", () => {
    const scheduler = new MutationScheduler(1000);

    expect(scheduler.shouldQueue).toBe(false);
  });

  it("defers a write made while a commit is in flight, then replays it", () => {
    const scheduler = new MutationScheduler(1000);
    const order: string[] = [];

    scheduler.runStoreMutation(() => {
      order.push("commit");
      expect(scheduler.shouldQueue).toBe(true);
      scheduler.enqueue(() => order.push("deferred"));
    });

    // The queued write must land after the commit, not interleave with it.
    expect(order).toEqual(["commit", "deferred"]);
    expect(scheduler.shouldQueue).toBe(false);
  });

  it("defers a write made by a listener during notification", () => {
    const scheduler = new MutationScheduler(1000);
    const order: string[] = [];

    scheduler.runNotification(() => {
      order.push("notify");
      expect(scheduler.shouldQueue).toBe(true);
      scheduler.enqueue(() => order.push("listener write"));
    });

    expect(order).toEqual(["notify"]);

    scheduler.flush();

    expect(order).toEqual(["notify", "listener write"]);
  });

  it("discards writes scheduled by a commit that then threw", () => {
    const scheduler = new MutationScheduler(1000);
    const replayed: string[] = [];
    const failure = new Error("commit failed");

    scheduler.enqueue(() => replayed.push("queued before"));

    expect(() =>
      scheduler.runStoreMutation(() => {
        scheduler.enqueue(() => replayed.push("queued by failed commit"));
        throw failure;
      }),
    ).toThrow(failure);

    scheduler.flush();

    // Only work scheduled by the failed commit is dropped; what was already
    // queued was scheduled by something that did complete.
    expect(replayed).toEqual(["queued before"]);
  });

  it("returns the commit's own result", () => {
    const scheduler = new MutationScheduler(1000);

    expect(scheduler.runStoreMutation(() => "committed")).toBe("committed");
  });

  it("does not re-enter flush while it is already draining", () => {
    const scheduler = new MutationScheduler(1000);
    let drains = 0;

    scheduler.enqueue(() => {
      drains += 1;
      // A queued write that flushes again must not start a second drain.
      scheduler.flush();
    });
    scheduler.flush();

    expect(drains).toBe(1);
  });

  it("observes a rejected async mutation instead of leaking it", async () => {
    const scheduler = new MutationScheduler(1000);
    const rejections: unknown[] = [];
    const onUnhandledRejection = (error: unknown) => {
      rejections.push(error);
    };

    process.on("unhandledRejection", onUnhandledRejection);

    try {
      scheduler.enqueue(() => Promise.reject(new Error("async mutation failed")));
      scheduler.flush();
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }

    expect(rejections).toEqual([]);
  });

  it("aborts a cascade that keeps re-queueing itself", () => {
    const scheduler = new MutationScheduler(5);
    let runs = 0;

    const requeue = () => {
      runs += 1;
      scheduler.enqueue(requeue);
    };

    scheduler.enqueue(requeue);

    // Without the cap this loop never ends and the app hangs with no diagnosis.
    expect(() => scheduler.flush()).toThrow(
      "Aborted a mutation cascade after 5 queued mutations; " +
        "a watch listener or plugin hook is likely re-triggering itself.",
    );
    expect(runs).toBe(5);

    // The queue is cleared, so the app is usable again rather than stuck
    // replaying the same cascade on the next commit.
    scheduler.flush();
    expect(runs).toBe(5);
  });
});
