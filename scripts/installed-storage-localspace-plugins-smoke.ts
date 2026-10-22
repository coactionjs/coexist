#!/usr/bin/env node
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPackPackage, lockfilePath, readCatalog, rootDir, run } from "./lib/smoke.ts";

const tempDir = await mkdtemp(join(tmpdir(), "coexist-storage-localspace-plugins-"));
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

  console.log("Verified installed storage localspace plugin exports.");
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

async function writeConsumerProject({ catalog, coreTarball, storageTarball }) {
  await mkdir(consumerDir, { recursive: true });
  await writeFile(
    join(consumerDir, "package.json"),
    `${JSON.stringify(
      {
        name: "coexist-storage-localspace-plugins-smoke",
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
          lib: ["ES2023", "DOM"],
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
  return `// The drivers and plugins are re-exported by @coexist/storage; their types are
// not, so they are named from localspace, which this consumer already installs.
import type { LocalSpaceOptions, LocalSpacePlugin } from "localspace";
import {
  compressionPlugin,
  createLocalSpaceStorage,
  encryptionPlugin,
  indexedDBDriver,
  localStorageDriver,
  memoryDriver,
  ttlPlugin,
  type StorageService,
} from "@coexist/storage";

const pluginStack: LocalSpacePlugin[] = [
  ttlPlugin({ defaultTTL: 1_000, keyTTL: { session: 10_000 } }),
  compressionPlugin({ threshold: 1 }),
  encryptionPlugin({ key: "0123456789abcdef0123456789abcdef" }),
];

const options: LocalSpaceOptions = {
  driver: memoryDriver._driver,
  name: "coexist-storage-localspace-plugins-type",
  plugins: pluginStack,
  storeName: "state",
};
const storage: StorageService = createLocalSpaceStorage({ options });
const drivers: readonly string[] = [
  indexedDBDriver._driver,
  localStorageDriver._driver,
  memoryDriver._driver,
];

void [drivers, storage];
`;
}

function createRuntimeConsumerSource() {
  return `import * as storageModule from "@coexist/storage";
import {
  compressionPlugin,
  createLocalSpaceStorage,
  encryptionPlugin,
  indexedDBDriver,
  localStorageDriver,
  memoryDriver,
  ttlPlugin,
} from "@coexist/storage";

// localspace 2 removed both plugins, and 2.0 of this package stopped
// re-exporting them; a consumer must not find a stale binding.
for (const removed of ["quotaPlugin", "syncPlugin"]) {
  if (removed in storageModule) {
    throw new Error(removed + " is still exported from @coexist/storage.");
  }
}

{
  const storageName = "coexist-storage-localspace-plugins-smoke-" + Date.now();
  const secretPayload = {
    nested: { ready: true },
    text: "x".repeat(2048),
  };
  const batchPayload = [
    { key: "batch-a", value: { text: "a".repeat(1024) } },
    { key: "batch-b", value: { text: "b".repeat(1024) } },
  ];
  const expired = [];
  const storage = createLocalSpaceStorage({
    options: {
      driver: memoryDriver._driver,
      name: storageName,
      plugins: [
        ttlPlugin({
          defaultTTL: 1_000,
          keyTTL: { short: 20 },
          onExpire(key, value) {
            expired.push({ key, value });
          },
        }),
        compressionPlugin({ threshold: 1 }),
        encryptionPlugin({ key: "0123456789abcdef0123456789abcdef" }),
      ],
      storeName: "state",
    },
  });

  expectEqual(indexedDBDriver._driver, "asyncStorage", "indexedDB driver export");
  expectEqual(localStorageDriver._driver, "localStorageWrapper", "localStorage driver export");
  expectEqual(memoryDriver._driver, "memoryStorageWrapper", "memory driver export");

  await storage.ready();
  expectEqual(storage.driver(), memoryDriver._driver, "storage uses re-exported memory driver");

  await storage.set("secret", secretPayload);
  expectJsonEqual(await storage.get("secret"), secretPayload, "plugin stack set/get round-trip");

  await storage.setMany(batchPayload);
  expectJsonEqual(
    await storage.getMany(batchPayload.map((entry) => entry.key)),
    batchPayload,
    "plugin stack batch round-trip",
  );

  await storage.set("short", { ttl: true });
  expectJsonEqual(await storage.get("short"), { ttl: true }, "ttl value before expiration");
  await delay(60);
  expectEqual(await storage.get("short"), null, "ttl expired value");
  expectJsonEqual(expired, [{ key: "short", value: { ttl: true } }], "ttl onExpire callback");

  await expectRejects(
    storage.set("rich", { at: new Date(0) }),
    "Value at",
    "localspace rejects values that are not plain data",
  );
  expectEqual(await storage.get("rich"), null, "rejected value is not stored");

  await storage.close();
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function expectEqual(actual, expected, label) {
  if (!Object.is(actual, expected)) {
    throw new Error(label + ": expected " + String(expected) + ", got " + String(actual));
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
