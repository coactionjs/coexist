#!/usr/bin/env node
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPackPackage, lockfilePath, readCatalog, rootDir, run } from "./lib/smoke.ts";

const tempDir = await mkdtemp(join(tmpdir(), "coexist-storage-like-plugin-"));
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

  console.log("Verified installed StorageLike plugin runtime.");
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

async function writeConsumerProject({ catalog, coreTarball, storageTarball }) {
  await mkdir(consumerDir, { recursive: true });
  await writeFile(
    join(consumerDir, "package.json"),
    `${JSON.stringify(
      {
        name: "coexist-storage-like-plugin-smoke",
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
  return `import { createApp, defineModule } from "@coexist/core";
import {
  createStoragePlugin,
  type StorageLike,
  type StoragePlugin,
  type StoragePluginErrorPhase,
} from "@coexist/storage";

type StoredState = {
  readonly typedCounter?: {
    readonly count: number;
  };
};

class TypeCounter {
  count = 0;

  increase(): void {
    this.count += 1;
  }
}

defineModule(TypeCounter, {
  actions: ["increase"],
  name: "typedCounter",
  state: ["count"],
});

const storage: StorageLike = {
  getItem: (_key: string) => null,
  removeItem: async (_key: string) => undefined,
  setItem: async (_key: string, _value: string) => undefined,
};
const errors: Array<{ readonly error: unknown; readonly phase: StoragePluginErrorPhase }> = [];
const plugin: StoragePlugin = createStoragePlugin<StoredState>({
  deserialize: (value) => JSON.parse(value) as StoredState,
  key: "app",
  merge: (persisted, current) => ({ ...(current as object), ...persisted }),
  onError(error, phase) {
    errors.push({ error, phase });
  },
  partialize: (state) => ({
    typedCounter: (state as { readonly typedCounter?: { readonly count: number } }).typedCounter,
  }),
  serialize: (state) => JSON.stringify(state),
  shouldPersist: (event) => event.state !== null,
  storage,
});
const app = createApp({
  plugins: [plugin],
  providers: [TypeCounter],
});

void [app, errors, plugin.ready(), plugin.flush(), plugin.clear()];
`;
}

function createRuntimeConsumerSource() {
  return `import { createApp, defineModule } from "@coexist/core";
import { createStoragePlugin } from "@coexist/storage";

class AsyncMemoryStorage {
  constructor() {
    this.values = new Map();
    this.writes = [];
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  removeItem(key) {
    return Promise.resolve().then(() => {
      this.values.delete(key);
    });
  }

  setItem(key, value) {
    this.writes.push(value);

    return Promise.resolve().then(() => {
      this.values.set(key, value);
    });
  }
}

class Counter {
  constructor() {
    this.count = 0;
  }

  increase(step = 1) {
    this.count += step;
    return this.count;
  }
}

class Preferences {
  constructor() {
    this.theme = "light";
  }

  setTheme(theme) {
    this.theme = theme;
  }
}

defineModule(Counter, {
  actions: ["increase"],
  name: "storageLikeCounter",
  state: ["count"],
});
defineModule(Preferences, {
  actions: ["setTheme"],
  name: "storageLikePreferences",
  state: ["theme"],
});

const storage = new AsyncMemoryStorage();
storage.values.set(
  "app",
  JSON.stringify({
    payload: {
      storageLikeCounter: {
        count: 4,
      },
    },
  }),
);

const plugin = createStoragePlugin({
  deserialize(value) {
    return JSON.parse(value).payload;
  },
  key: "app",
  merge(persisted, current) {
    return {
      ...current,
      ...persisted,
      storageLikePreferences: current.storageLikePreferences,
    };
  },
  partialize(state) {
    return {
      storageLikeCounter: state.storageLikeCounter,
    };
  },
  serialize(state) {
    return JSON.stringify({
      payload: state,
    });
  },
  shouldPersist(event) {
    return event.state.storageLikeCounter?.count !== 6;
  },
  storage,
});
const app = createApp({
  plugins: [plugin],
  providers: [Counter, Preferences],
});

await app.start();

const counter = app.getModule(Counter);
const preferences = app.getModule(Preferences);

expectEqual(counter.count, 4, "hydrated custom storage count");
expectEqual(preferences.theme, "light", "merge keeps current defaults");

counter.increase();
expectEqual(readStoredCount(storage), 4, "queued write waits for flush");
await plugin.flush();
expectEqual(readStoredCount(storage), 5, "flush persists partial state");
expectJsonEqual(readStoredPayload(storage), { storageLikeCounter: { count: 5 } }, "partialized payload");

preferences.setTheme("dark");
await plugin.flush();
expectJsonEqual(readStoredPayload(storage), { storageLikeCounter: { count: 5 } }, "partialize excludes preferences");

counter.increase();
await plugin.flush();
expectEqual(readStoredCount(storage), 5, "shouldPersist can skip a state change");

await plugin.persist(app);
expectEqual(readStoredCount(storage), 6, "manual persist writes current state");

await plugin.clear();
expectEqual(storage.getItem("app"), null, "clear removes stored state");

counter.increase();
await app.dispose();
expectEqual(readStoredCount(storage), 7, "dispose flushes queued custom storage writes");

function readStoredPayload(storageLike) {
  const stored = storageLike.getItem("app");

  if (stored === null) {
    throw new Error("Expected stored payload.");
  }

  return JSON.parse(stored).payload;
}

function readStoredCount(storageLike) {
  return readStoredPayload(storageLike).storageLikeCounter.count;
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
`;
}

function readCatalogVersion(catalog, name) {
  const version = catalog.get(name);

  if (version === undefined) {
    throw new Error(`${name} is missing from pnpm-workspace.yaml catalog.`);
  }

  return version;
}
