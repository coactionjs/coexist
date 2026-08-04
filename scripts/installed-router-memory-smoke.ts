#!/usr/bin/env node
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPackPackage, lockfilePath, readCatalog, rootDir, run } from "./lib/smoke.ts";

const tempDir = await mkdtemp(join(tmpdir(), "coexist-router-memory-"));
const tarballsDir = join(tempDir, "tarballs");
const packPackage = createPackPackage(tarballsDir);
const consumerDir = join(tempDir, "consumer");
const tscBin = join(rootDir, "node_modules/.bin/tsc");

try {
  const catalog = await readCatalog();
  const coreTarball = await packPackage("@coexist/core");
  const routerTarball = await packPackage("@coexist/router");

  await writeConsumerProject({ catalog, coreTarball, routerTarball });
  await run(
    "pnpm",
    ["install", "--prefer-offline", "--no-frozen-lockfile", "--ignore-scripts"],
    consumerDir,
  );
  await run(tscBin, ["-p", "tsconfig.json"], consumerDir);
  await run(process.execPath, ["runtime.mjs"], consumerDir);

  console.log("Verified installed router memory provider runtime.");
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

async function writeConsumerProject({ catalog, coreTarball, routerTarball }) {
  await mkdir(consumerDir, { recursive: true });
  await writeFile(
    join(consumerDir, "package.json"),
    `${JSON.stringify(
      {
        name: "coexist-router-memory-smoke",
        private: true,
        type: "module",
        dependencies: {
          "@coexist/core": `file:${coreTarball}`,
          "@coexist/router": `file:${routerTarball}`,
          coaction: readCatalogVersion(catalog, "coaction"),
        },
        devDependencies: {
          typescript: readCatalogVersion(catalog, "typescript"),
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(join(consumerDir, "pnpm-lock.yaml"), await readFile(lockfilePath, "utf8"));
  await writeFile(
    join(consumerDir, "pnpm-workspace.yaml"),
    [
      "minimumReleaseAgeExclude:",
      `  - ${JSON.stringify(`coaction@${readCatalogVersion(catalog, "coaction")}`)}`,
      "overrides:",
      `  "@coexist/core": ${JSON.stringify(`file:${coreTarball}`)}`,
      `  "@coexist/router": ${JSON.stringify(`file:${routerTarball}`)}`,
      `  "coaction": ${JSON.stringify(readCatalogVersion(catalog, "coaction"))}`,
      `  "typescript": ${JSON.stringify(readCatalogVersion(catalog, "typescript"))}`,
      "",
    ].join("\n"),
  );
  await writeFile(
    join(consumerDir, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          lib: ["ES2023"],
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          skipLibCheck: true,
          strict: true,
          target: "ES2022",
        },
        include: ["index.ts"],
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(join(consumerDir, "index.ts"), createTypeConsumerSource());
  await writeFile(join(consumerDir, "runtime.mjs"), createRuntimeConsumerSource());
}

function createTypeConsumerSource() {
  return `import { createApp, type App } from "@coexist/core";
import {
  RouterToken,
  createMemoryRouter,
  createRouterPlugin,
  formatLocation,
  parseLocation,
  provideRouter,
  type RouteLocation,
  type Router,
} from "@coexist/router";

const router: Router = createMemoryRouter({
  initialPath: "/initial?tab=type#top",
});
const parsed: RouteLocation = parseLocation("/parsed?value=1#hash");
const formatted: string = formatLocation(parsed);
const app: App = createApp({
  plugins: [createRouterPlugin(router, { immediate: true })],
  providers: [provideRouter(router)],
});

app.get(RouterToken).navigate("/typed");

void [app, formatted, router.current];
`;
}

function createRuntimeConsumerSource() {
  return `import { createApp } from "@coexist/core";
import {
  RouterToken,
  createMemoryRouter,
  createRouterPlugin,
  formatLocation,
  parseLocation,
  provideRouter,
} from "@coexist/router";

await verifyMemoryRouter();
await verifyPluginLifecycleAndProviders();

async function verifyMemoryRouter() {
  const router = createMemoryRouter({
    initialPath: "/initial?tab=1#top",
  });
  const events = [];
  const unsubscribe = router.subscribe((location) => {
    events.push(formatLocation(location));
  });

  expectJsonEqual(
    router.current,
    {
      hash: "#top",
      path: "/initial",
      search: "?tab=1",
    },
    "initial memory router location",
  );
  expectJsonEqual(
    parseLocation("/users?id=1#profile"),
    {
      hash: "#profile",
      path: "/users",
      search: "?id=1",
    },
    "parseLocation segments",
  );
  expectEqual(
    formatLocation({
      hash: "#profile",
      path: "/users",
      search: "?id=1",
    }),
    "/users?id=1#profile",
    "formatLocation href",
  );

  router.navigate("/settings?mode=dark");
  router.navigate({ hash: "#shortcuts", path: "/help", search: "" });

  expectJsonEqual(events, ["/settings?mode=dark", "/help#shortcuts"], "memory router events");
  expectJsonEqual(
    router.current,
    {
      hash: "#shortcuts",
      path: "/help",
      search: "",
    },
    "current memory router location",
  );

  unsubscribe();
  router.navigate("/ignored");

  expectJsonEqual(events, ["/settings?mode=dark", "/help#shortcuts"], "router unsubscribe");
}

async function verifyPluginLifecycleAndProviders() {
  const router = createMemoryRouter({
    initialPath: "/",
  });
  const locations = [];
  const app = createApp({
    plugins: [
      createRouterPlugin(router, {
        immediate: true,
        onChange(location, runtime) {
          locations.push(formatLocation(location) + ":" + String(runtime.get(RouterToken) === router));
        },
      }),
    ],
  });

  await app.start();
  app.get(RouterToken).navigate("/settings");

  expectSame(app.get(RouterToken), router, "router plugin provides RouterToken");
  expectJsonEqual(locations, ["/:true", "/settings:true"], "router plugin lifecycle events");

  await app.dispose();
  router.navigate("/ignored");

  expectJsonEqual(locations, ["/:true", "/settings:true"], "router plugin unsubscribes on dispose");

  const pluginRouter = createMemoryRouter({
    initialPath: "/plugin",
  });
  const appRouter = createMemoryRouter({
    initialPath: "/app",
  });
  const overrideApp = createApp({
    plugins: [createRouterPlugin(pluginRouter)],
    providers: [provideRouter(appRouter)],
  });

  overrideApp.get(RouterToken).navigate("/from-app");

  expectSame(overrideApp.get(RouterToken), appRouter, "app provider overrides router plugin");
  expectEqual(appRouter.current.path, "/from-app", "app router handles navigation");
  expectEqual(pluginRouter.current.path, "/plugin", "plugin router remains unchanged");

  await overrideApp.dispose();
}

function expectEqual(actual, expected, label) {
  if (!Object.is(actual, expected)) {
    throw new Error(label + ": expected " + String(expected) + ", got " + String(actual));
  }
}

function expectSame(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(label + ": expected references to match");
  }
}

function expectJsonEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(label + ": expected " + expectedJson + ", got " + actualJson);
  }
}
`;
}

function readCatalogVersion(catalog, name) {
  const version = catalog.get(name);

  if (version === undefined) {
    throw new Error(`${name} is missing from pnpm-workspace.yaml catalog.`);
  }

  return version;
}
