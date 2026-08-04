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
  return `import {
  compressionPlugin,
  createLocalSpaceStorage,
  encryptionPlugin,
  indexedDBDriver,
  localStorageDriver,
  memoryDriver,
  quotaPlugin,
  syncPlugin,
  ttlPlugin,
  type LocalSpaceOptions,
  type LocalSpacePlugin,
  type PerformanceStats,
  type StorageService,
} from "@coexist/storage";

const syncOptions: NonNullable<Parameters<typeof syncPlugin>[0]> = {
  channelName: "coexist-storage-localspace-plugins-type",
  syncKeys: ["session"],
};
const pluginStack: LocalSpacePlugin[] = [
  ttlPlugin({ defaultTTL: 1_000, keyTTL: { session: 10_000 } }),
  compressionPlugin({ threshold: 1 }),
  encryptionPlugin({ key: "0123456789abcdef0123456789abcdef" }),
  quotaPlugin({ maxSize: 1024 * 1024 }),
  syncPlugin(syncOptions),
];

const options: LocalSpaceOptions = {
  driver: memoryDriver._driver,
  name: "coexist-storage-localspace-plugins-type",
  plugins: pluginStack,
  storeName: "state",
};
const storage: StorageService = createLocalSpaceStorage({ options });
const stats: PerformanceStats | undefined = storage.getPerformanceStats();
const drivers: readonly string[] = [
  indexedDBDriver._driver,
  localStorageDriver._driver,
  memoryDriver._driver,
];

void [drivers, stats, storage];
`;
}

function createRuntimeConsumerSource() {
  return `import {
  compressionPlugin,
  createLocalSpaceStorage,
  encryptionPlugin,
  indexedDBDriver,
  localStorageDriver,
  memoryDriver,
  quotaPlugin,
  syncPlugin,
  ttlPlugin,
} from "@coexist/storage";

const warnings = [];
const originalWarn = console.warn;
console.warn = (...args) => {
  warnings.push(args.map(String).join(" "));
};

try {
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
        quotaPlugin({ maxSize: 32 * 1024 }),
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

  const quotaEvents = [];
  const quotaStorage = createLocalSpaceStorage({
    options: {
      driver: memoryDriver._driver,
      name: storageName + "-quota",
      plugins: [
        quotaPlugin({
          maxSize: 64,
          onQuotaExceeded(info) {
            quotaEvents.push({
              currentUsage: info.currentUsage,
              key: info.key,
              maxSize: info.maxSize,
            });
          },
        }),
      ],
      storeName: "state",
    },
  });

  await quotaStorage.ready();
  await expectRejects(
    quotaStorage.set("too-large", { text: "z".repeat(256) }),
    "Storage quota exceeded",
    "quota plugin rejects oversized writes",
  );
  expectEqual(await quotaStorage.get("too-large"), null, "quota rejection does not persist value");
  expectJsonEqual(
    quotaEvents,
    [{ currentUsage: 0, key: "too-large", maxSize: 64 }],
    "quota exceeded callback payload",
  );

  const sync = syncPlugin({
    channelName: storageName + "-sync",
    syncKeys: ["secret"],
  });
  expectEqual(sync.name, "sync", "sync plugin export");

  await quotaStorage.destroy();
  await storage.destroy();

  if (!warnings.some((warning) => warning.includes("quotaPlugin"))) {
    throw new Error("quota plugin warning was not emitted");
  }

  if (!warnings.some((warning) => warning.includes("syncPlugin"))) {
    throw new Error("sync plugin warning was not emitted");
  }
} finally {
  console.warn = originalWarn;
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
