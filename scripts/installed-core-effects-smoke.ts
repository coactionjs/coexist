#!/usr/bin/env node
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPackPackage, lockfilePath, readCatalog, rootDir, run } from "./lib/smoke.ts";

const tempDir = await mkdtemp(join(tmpdir(), "coexist-core-effects-"));
const tarballsDir = join(tempDir, "tarballs");
const packPackage = createPackPackage(tarballsDir);
const consumerDir = join(tempDir, "consumer");
const tscBin = join(rootDir, "node_modules/.bin/tsc");

try {
  const catalog = await readCatalog();
  const coreTarball = await packPackage("@coexist/core");

  await writeConsumerProject(coreTarball, catalog);
  await run(
    "pnpm",
    ["install", "--prefer-offline", "--no-frozen-lockfile", "--ignore-scripts"],
    consumerDir,
  );
  await run(tscBin, ["-p", "tsconfig.json"], consumerDir);
  await run(process.execPath, ["runtime.mjs"], consumerDir);

  console.log("Verified installed core module effects runtime.");
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

async function writeConsumerProject(coreTarball, catalog) {
  await mkdir(consumerDir, { recursive: true });
  await writeFile(
    join(consumerDir, "package.json"),
    `${JSON.stringify(
      {
        name: "coexist-core-effects-smoke",
        private: true,
        type: "module",
        dependencies: {
          "@coexist/core": `file:${coreTarball}`,
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
  return `import { defineModule, testApp, type TestApp } from "@coexist/core";

class TypeEffectCounter {
  count = 0;

  increase(): void {
    this.count += 1;
  }

  record(): void {
    void this.count;
  }
}

defineModule(TypeEffectCounter, {
  actions: ["increase"],
  effects: ["record"],
  name: "typeEffectCounter",
  state: ["count"],
});

const app: TestApp = testApp({
  providers: [TypeEffectCounter],
});
const counter: TypeEffectCounter = app.getModule(TypeEffectCounter);

counter.increase();
await app.test.flushEffects();
await app.dispose();

void [app.test.getState(), counter.count];
`;
}

function createRuntimeConsumerSource() {
  return `import { defineModule, testApp } from "@coexist/core";

const syncEvents = [];
const asyncEvents = [];

class EffectCounter {
  constructor() {
    this.count = 0;
  }

  recordCount() {
    syncEvents.push("count:" + String(this.count));
  }

  increase(step = 1) {
    this.count += step;
  }
}

defineModule(EffectCounter, {
  actions: ["increase"],
  effects: ["recordCount"],
  name: "effectCounter",
  state: ["count"],
});

class AsyncEffectCounter {
  constructor() {
    this.count = 0;
  }

  async recordCount() {
    const count = this.count;

    await Promise.resolve();
    asyncEvents.push("async:" + String(count));
  }

  increase(step = 1) {
    this.count += step;
  }
}

defineModule(AsyncEffectCounter, {
  actions: ["increase"],
  effects: ["recordCount"],
  name: "asyncEffectCounter",
  state: ["count"],
});

await verifySyncEffects();
await verifyAsyncEffects();

async function verifySyncEffects() {
  const app = testApp({
    providers: [EffectCounter],
  });
  const counter = app.getModule(EffectCounter);

  await app.test.flushEffects();
  expectJsonEqual(syncEvents, ["count:0"], "initial sync effect");

  counter.increase(2);
  await app.test.flushEffects();
  expectJsonEqual(syncEvents, ["count:0", "count:2"], "sync effect reruns for tracked state");
  expectJsonEqual(
    app.test.getState(),
    {
      effectCounter: { count: 2 },
    },
    "sync effect smoke final state",
  );

  await app.dispose();
  expectThrows(
    () => counter.increase(1),
    "Cannot run module actions after app disposal has begun.",
    "sync retained action is terminal",
  );
  expectJsonEqual(syncEvents, ["count:0", "count:2"], "sync effect stops on dispose");
}

async function verifyAsyncEffects() {
  const app = testApp({
    providers: [AsyncEffectCounter],
  });
  const asyncCounter = app.getModule(AsyncEffectCounter);

  await app.test.flushEffects();
  expectJsonEqual(asyncEvents, ["async:0"], "initial async effect");

  asyncCounter.increase(3);
  await app.test.flushEffects();
  expectJsonEqual(asyncEvents, ["async:0", "async:3"], "flushEffects waits for async rerun");
  expectJsonEqual(
    app.test.getState(),
    {
      asyncEffectCounter: { count: 3 },
    },
    "async effect smoke final state",
  );

  await app.dispose();
  expectThrows(
    () => asyncCounter.increase(1),
    "Cannot run module actions after app disposal has begun.",
    "async retained action is terminal",
  );
  expectJsonEqual(asyncEvents, ["async:0", "async:3"], "async effect stops on dispose");
}

function expectThrows(callback, expectedMessage, label) {
  try {
    callback();
  } catch (error) {
    if (error instanceof Error && error.message === expectedMessage) {
      return;
    }

    throw new Error(label + ": unexpected error " + String(error));
  }

  throw new Error(label + ": expected an error");
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
