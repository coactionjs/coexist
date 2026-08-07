import { describe, expect, it } from "vitest";

import { createApp } from "@coexist/core";

import {
  RouterToken,
  createBrowserRouter,
  createMemoryRouter,
  createRouterPlugin,
  formatLocation,
  parseLocation,
  provideRouter,
  type BrowserWindowLike,
} from "./index.js";

describe("router package", () => {
  it("parses path, search, and hash segments", () => {
    expect(parseLocation("/users?id=1#profile")).toEqual({
      hash: "#profile",
      path: "/users",
      search: "?id=1",
    });
  });

  it("formats route locations into browser hrefs", () => {
    expect(
      formatLocation({
        hash: "#profile",
        path: "/users",
        search: "?id=1",
      }),
    ).toBe("/users?id=1#profile");
  });

  it("provides a router through the Coexist app container", () => {
    const router = createMemoryRouter({
      initialPath: "/",
    });
    const app = createApp({
      providers: [provideRouter(router)],
    });
    const locations: string[] = [];

    app.get(RouterToken).subscribe((location) => {
      locations.push(location.path);
    });
    app.get(RouterToken).navigate("/settings");

    expect(locations).toEqual(["/settings"]);
    expect(app.get(RouterToken).current.path).toBe("/settings");
  });

  it("bridges router changes through the router plugin lifecycle", async () => {
    const router = createMemoryRouter({
      initialPath: "/",
    });
    const locations: string[] = [];
    const app = createApp({
      plugins: [
        createRouterPlugin(router, {
          immediate: true,
          onChange(location) {
            locations.push(location.path);
          },
        }),
      ],
      providers: [provideRouter(router)],
    });

    await app.start();
    router.navigate("/settings");

    expect(locations).toEqual(["/", "/settings"]);

    await app.dispose();
    router.navigate("/ignored");

    expect(locations).toEqual(["/", "/settings"]);
  });

  it("provides the router through the router plugin", () => {
    const router = createMemoryRouter({
      initialPath: "/",
    });
    const app = createApp({
      plugins: [createRouterPlugin(router)],
    });

    app.get(RouterToken).navigate("/settings");

    expect(router.current.path).toBe("/settings");
    expect(app.get(RouterToken)).toBe(router);
  });

  it("lets app-level router providers override the router plugin provider", () => {
    const pluginRouter = createMemoryRouter({
      initialPath: "/plugin",
    });
    const appRouter = createMemoryRouter({
      initialPath: "/app",
    });
    const app = createApp({
      plugins: [createRouterPlugin(pluginRouter)],
      providers: [provideRouter(appRouter)],
    });

    app.get(RouterToken).navigate("/settings");

    expect(app.get(RouterToken)).toBe(appRouter);
    expect(appRouter.current.path).toBe("/settings");
    expect(pluginRouter.current.path).toBe("/plugin");
  });

  it("normalizes empty paths in both directions", () => {
    expect(parseLocation("")).toEqual({ hash: "", path: "/", search: "" });
    expect(parseLocation("?tab=1")).toEqual({ hash: "", path: "/", search: "?tab=1" });
    expect(parseLocation("#top")).toEqual({ hash: "#top", path: "/", search: "" });
    expect(formatLocation({ hash: "", path: "", search: "" })).toBe("/");
    expect(formatLocation({ hash: "#top", path: "", search: "?tab=1" })).toBe("/?tab=1#top");
  });

  it("requires a browser window when none is supplied", () => {
    const globalWithWindow = globalThis as { window?: unknown };
    const original = Object.hasOwn(globalWithWindow, "window")
      ? globalWithWindow.window
      : undefined;

    delete globalWithWindow.window;

    try {
      expect(() => createBrowserRouter()).toThrow(
        "createBrowserRouter() requires a browser window.",
      );
    } finally {
      if (original !== undefined) {
        globalWithWindow.window = original;
      }
    }
  });

  it("reads the ambient window when one exists", () => {
    const globalWithWindow = globalThis as { window?: unknown };
    const browserWindow = createMockBrowserWindow("/ambient");

    globalWithWindow.window = browserWindow;

    try {
      expect(createBrowserRouter().current.path).toBe("/ambient");
    } finally {
      delete globalWithWindow.window;
    }
  });

  it("normalizes an empty browser pathname to the root", () => {
    const browserWindow = createMockBrowserWindow("/");
    Object.defineProperty(browserWindow, "location", {
      get: () => ({ hash: "", pathname: "", search: "" }),
    });

    expect(createBrowserRouter({ window: browserWindow }).current.path).toBe("/");
  });

  it("accepts a route location object as a navigation target", () => {
    const router = createMemoryRouter({ initialPath: "/" });
    const seen: string[] = [];

    router.subscribe((location) => {
      seen.push(formatLocation(location));
    });
    router.navigate({ hash: "#top", path: "/settings", search: "?tab=1" });

    expect(router.current.path).toBe("/settings");
    expect(seen).toEqual(["/settings?tab=1#top"]);
  });

  it("swallows a rejected async error observer", async () => {
    const router = createMemoryRouter({
      initialPath: "/",
      // An observer returning a rejected promise must not become an unhandled
      // rejection: it is the terminal reporter, with nowhere left to report.
      onError: () => Promise.reject(new Error("observer rejected")) as never,
    });
    const rejections: unknown[] = [];
    const onUnhandledRejection = (error: unknown) => {
      rejections.push(error);
    };

    router.subscribe(() => {
      throw new Error("subscriber failed");
    });

    process.on("unhandledRejection", onUnhandledRejection);

    try {
      router.navigate("/settings");
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }

    expect(rejections).toEqual([]);
    expect(router.current.path).toBe("/settings");
  });

  it("keeps notifying subscribers after one of them throws", () => {
    const errors: unknown[] = [];
    const listenerError = new Error("subscriber failed");
    const router = createMemoryRouter({
      initialPath: "/",
      onError(error) {
        errors.push(error);
      },
    });
    const seen: string[] = [];

    router.subscribe(() => {
      throw listenerError;
    });
    router.subscribe((location) => {
      seen.push(location.path);
    });

    expect(() => router.navigate("/settings")).not.toThrow();
    expect(seen).toEqual(["/settings"]);
    expect(errors).toEqual([listenerError]);
  });

  it("keeps navigating when a browser router subscriber throws", () => {
    const browserWindow = createMockBrowserWindow("/");
    const errors: unknown[] = [];
    const router = createBrowserRouter({
      onError(error) {
        errors.push(error);
      },
      window: browserWindow,
    });
    const seen: string[] = [];

    router.subscribe(() => {
      throw new Error("subscriber failed");
    });
    router.subscribe((location) => {
      seen.push(location.path);
    });

    expect(() => router.navigate("/settings")).not.toThrow();
    expect(() => browserWindow.pushPopState("/back")).not.toThrow();
    expect(seen).toEqual(["/settings", "/back"]);
    expect(errors).toHaveLength(2);
  });

  it("isolates a throwing router error observer from navigation", async () => {
    const router = createMemoryRouter({ initialPath: "/" });
    const changeError = new Error("onChange failed");
    const app = createApp({
      plugins: [
        createRouterPlugin(router, {
          onChange() {
            throw changeError;
          },
          onError() {
            throw new Error("observer failed");
          },
        }),
      ],
      providers: [provideRouter(router)],
    });

    await app.start();

    // A broken observer must not turn a reported failure into a thrown one.
    expect(() => router.navigate("/settings")).not.toThrow();
    expect(router.current.path).toBe("/settings");

    await app.dispose();
  });

  it("does not leave an unhandled rejection when an async onChange fails", async () => {
    const router = createMemoryRouter({ initialPath: "/" });
    const rejections: unknown[] = [];
    const onUnhandledRejection = (error: unknown) => {
      rejections.push(error);
    };
    const app = createApp({
      plugins: [
        createRouterPlugin(router, {
          onChange: () => Promise.reject(new Error("async onChange failed")),
          onError() {
            throw new Error("observer failed");
          },
        }),
      ],
      providers: [provideRouter(router)],
    });

    await app.start();
    process.on("unhandledRejection", onUnhandledRejection);

    try {
      router.navigate("/settings");
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }

    expect(rejections).toEqual([]);

    await app.dispose();
  });

  it("adapts browser history navigation to the router contract", () => {
    const browserWindow = createMockBrowserWindow("/initial?tab=1#top");
    const router = createBrowserRouter({
      window: browserWindow,
    });
    const locations: string[] = [];
    const unsubscribe = router.subscribe((location) => {
      locations.push(formatLocation(location));
    });

    expect(router.current).toEqual({
      hash: "#top",
      path: "/initial",
      search: "?tab=1",
    });

    router.navigate("/settings?mode=dark");

    expect(browserWindow.location).toEqual({
      hash: "",
      pathname: "/settings",
      search: "?mode=dark",
    });
    expect(locations).toEqual(["/settings?mode=dark"]);

    browserWindow.pushPopState("/back#hash");

    expect(router.current).toEqual({
      hash: "#hash",
      path: "/back",
      search: "",
    });
    expect(locations).toEqual(["/settings?mode=dark", "/back#hash"]);

    unsubscribe();
    browserWindow.pushPopState("/ignored");

    expect(locations).toEqual(["/settings?mode=dark", "/back#hash"]);
  });
});

function createMockBrowserWindow(initialPath: string): BrowserWindowLike & {
  pushPopState(path: string): void;
} {
  const listeners = new Set<() => void>();
  let location = toBrowserLocation(initialPath);

  return {
    get location() {
      return location;
    },
    history: {
      pushState(_data, _unused, url) {
        location = toBrowserLocation(String(url ?? "/"));
      },
    },
    addEventListener(_type, listener) {
      listeners.add(listener);
    },
    pushPopState(path) {
      location = toBrowserLocation(path);

      for (const listener of listeners) {
        listener();
      }
    },
    removeEventListener(_type, listener) {
      listeners.delete(listener);
    },
  };
}

function toBrowserLocation(path: string) {
  const location = parseLocation(path);

  return {
    hash: location.hash,
    pathname: location.path,
    search: location.search,
  };
}
