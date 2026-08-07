#!/usr/bin/env node
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPackPackage, lockfilePath, readCatalog, rootDir, run } from "./lib/smoke.ts";

const tempDir = await mkdtemp(join(tmpdir(), "coexist-storage-service-"));
const tarballsDir = join(tempDir, "tarballs");
const packPackage = createPackPackage(tarballsDir);
const consumerDir = join(tempDir, "consumer");
const tscBin = join(rootDir, "node_modules/.bin/tsc");

try {
  const catalog = await readCatalog();
  const coreTarball = await packPackage("@coexist/core");
  const storageTarball = await packPackage("@coexist/storage");

  await writeConsumerProject({ catalog, coreTarball, storageTarball });
  await run(
    "pnpm",
    ["install", "--prefer-offline", "--no-frozen-lockfile", "--ignore-scripts"],
    consumerDir,
  );
  await run(tscBin, ["-p", "tsconfig.json"], consumerDir);
  await run(process.execPath, ["runtime.mjs"], consumerDir);

  console.log("Verified installed storage service runtime.");
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

async function writeConsumerProject({ catalog, coreTarball, storageTarball }) {
  await mkdir(consumerDir, { recursive: true });
  await writeFile(
    join(consumerDir, "package.json"),
    `${JSON.stringify(
      {
        name: "coexist-storage-service-smoke",
        private: true,
        type: "module",
        dependencies: {
          "@coexist/core": `file:${coreTarball}`,
          "@coexist/storage": `file:${storageTarball}`,
          coaction: readCatalogVersion(catalog, "coaction"),
          localspace: readCatalogVersion(catalog, "localspace"),
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
      `  "@coexist/storage": ${JSON.stringify(`file:${storageTarball}`)}`,
      `  "coaction": ${JSON.stringify(readCatalogVersion(catalog, "coaction"))}`,
      `  "localspace": ${JSON.stringify(readCatalogVersion(catalog, "localspace"))}`,
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
  return `import { createApp } from "@coexist/core";
// localspace types are not this package's API to re-export: they are named from
// localspace itself, which a consumer configuring a store already installs.
import type { LocalSpacePlugin } from "localspace";
import {
  StorageToken,
  createLocalSpaceStorage,
  createLocalSpaceStoragePlugin,
  type StorageService,
  type StorageTransactionScope,
} from "@coexist/storage";

const storage: StorageService = createLocalSpaceStorage({
  options: {
    driver: "memoryStorageWrapper",
    name: "coexist-storage-service-type",
    storeName: "state",
  },
});
const localspacePlugin: LocalSpacePlugin = {
  name: "type-plugin",
  beforeSet(_key: string, value: unknown): unknown {
    return value;
  },
};
const plugin = createLocalSpaceStoragePlugin({
  hydrate: false,
  options: {
    driver: "memoryStorageWrapper",
    name: "coexist-storage-service-plugin-type",
    plugins: [localspacePlugin],
    storeName: "state",
  },
  persist: false,
});
const app = createApp({
  plugins: [plugin],
});
const transactionResult: number = await storage.transaction(
  "readwrite",
  async (scope: StorageTransactionScope) => {
    await scope.set("value", 1);
    return (await scope.get<number>("value")) ?? 0;
  },
);

void [app.get(StorageToken), transactionResult, storage.getPerformanceStats()];
`;
}

function createRuntimeConsumerSource() {
  return `import { createApp } from "@coexist/core";
import {
  StorageToken,
  createLocalSpaceStorage,
  createLocalSpaceStoragePlugin,
} from "@coexist/storage";

const storageName = "coexist-storage-service-smoke";
const storage = createLocalSpaceStorage({
  options: {
    driver: "memoryStorageWrapper",
    name: storageName,
    storeName: "state",
  },
});

await storage.ready();
expectEqual(storage.driver(), "memoryStorageWrapper", "memory storage driver");
expectEqual(await storage.length(), 0, "initial storage length");
expectEqual(storage.getPerformanceStats(), undefined, "memory driver performance stats");

await storage.set("one", { count: 1 });
expectJsonEqual(await storage.get("one"), { count: 1 }, "single set/get");

expectJsonEqual(
  await storage.setMany([
    { key: "two", value: { count: 2 } },
    { key: "three", value: { count: 3 } },
  ]),
  [
    { key: "two", value: { count: 2 } },
    { key: "three", value: { count: 3 } },
  ],
  "setMany result",
);
expectJsonEqual(
  await storage.getMany(["one", "two", "missing"]),
  [
    { key: "one", value: { count: 1 } },
    { key: "two", value: { count: 2 } },
    { key: "missing", value: null },
  ],
  "getMany result",
);
expectJsonEqual(
  (await storage.keys()).toSorted(),
  ["one", "three", "two"],
  "keys after batch set",
);

const transactionKeys = await storage.transaction("readwrite", async (scope) => {
  const two = await scope.get("two");

  await scope.set("four", { count: two.count + 2 });
  await scope.remove("three");

  return scope.keys();
});

expectJsonEqual(transactionKeys.toSorted(), ["four", "one", "two"], "transaction keys");
expectJsonEqual(await storage.get("four"), { count: 4 }, "transaction set result");
expectEqual(await storage.get("three"), null, "transaction remove result");
await expectRejects(
  storage.transaction("readonly", async (scope) => {
    await scope.set("bad", { count: 0 });
  }),
  "Transaction is readonly",
  "readonly transaction rejects writes",
);
expectEqual(await storage.get("bad"), null, "readonly transaction did not write");

await storage.removeMany(["one", "two"]);
expectJsonEqual(
  await storage.getMany(["one", "two", "four"]),
  [
    { key: "one", value: null },
    { key: "two", value: null },
    { key: "four", value: { count: 4 } },
  ],
  "removeMany result",
);

await storage.clear();
expectEqual(await storage.length(), 0, "storage clear result");

const pluginEvents = [];
const pluginStorage = createLocalSpaceStorage({
  options: {
    driver: "memoryStorageWrapper",
    name: storageName + "-plugins",
    plugins: [
      {
        name: "tagger",
        afterGet(key, value) {
          pluginEvents.push("get:" + key);
          return value;
        },
        beforeSet(key, value) {
          pluginEvents.push("set:" + key);
          return {
            ...value,
            tagged: true,
          };
        },
        onDestroy() {
          pluginEvents.push("destroy");
        },
      },
    ],
    storeName: "state",
  },
});

await pluginStorage.set("item", { value: 1 });
const pluginValue = await pluginStorage.get("item");
expectEqual(pluginValue.value, 1, "localspace plugin original value");
expectEqual(pluginValue.tagged, true, "localspace plugin tagged value");
await pluginStorage.destroy();
expectJsonEqual(pluginEvents, ["set:item", "get:item", "destroy"], "localspace plugin hooks");

const appStorage = createLocalSpaceStorage({
  options: {
    driver: "memoryStorageWrapper",
    name: storageName + "-di",
    storeName: "state",
  },
});
const storagePlugin = createLocalSpaceStoragePlugin({
  hydrate: false,
  persist: false,
  service: appStorage,
});
const app = createApp({
  plugins: [storagePlugin],
});

await app.start();
expectSame(app.get(StorageToken), appStorage, "storage service is provided through DI");
await app.get(StorageToken).set("di", { value: 5 });
expectJsonEqual(await storagePlugin.storage.get("di"), { value: 5 }, "storage token service writes");
await app.dispose();
await appStorage.destroy();
await storage.dropInstance({ name: storageName, storeName: "state" });
await storage.destroy();

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

async function expectRejects(promise, message, label) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error && error.message.includes(message)) {
      return;
    }

    throw new Error(label + ": expected " + message + ", got " + formatError(error));
  }

  throw new Error(label + ": expected rejection");
}

function formatError(error) {
  if (error instanceof Error) {
    return error.name + ": " + error.message;
  }

  return String(error);
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
