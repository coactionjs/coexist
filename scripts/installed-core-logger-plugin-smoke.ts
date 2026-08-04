#!/usr/bin/env node
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPackPackage, lockfilePath, readCatalog, rootDir, run } from "./lib/smoke.ts";

const tempDir = await mkdtemp(join(tmpdir(), "coexist-core-logger-plugin-"));
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

  console.log("Verified installed core logger plugin runtime.");
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

async function writeConsumerProject(coreTarball, catalog) {
  await mkdir(consumerDir, { recursive: true });
  await writeFile(
    join(consumerDir, "package.json"),
    `${JSON.stringify(
      {
        name: "coexist-core-logger-plugin-smoke",
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
  return `import {
  createApp,
  createLoggerPlugin,
  defineModule,
  type LoggerPluginLogger,
} from "@coexist/core";

class TypeLoggedCounter {
  count = 0;

  increase(): number {
    this.count += 1;
    return this.count;
  }
}

defineModule(TypeLoggedCounter, {
  actions: ["increase"],
  name: "typeLoggedCounter",
  state: ["count"],
});

const logger: LoggerPluginLogger = {
  error(_message, _details): void {},
  info(_message, _details): void {},
};
const app = createApp({
  plugins: [createLoggerPlugin({ logger })],
  providers: [TypeLoggedCounter],
});

void app.getModule(TypeLoggedCounter).increase();
`;
}

function createRuntimeConsumerSource() {
  return `import {
  createApp,
  createLoggerPlugin,
  defineModule,
} from "@coexist/core";

class LoggedCounter {
  constructor() {
    this.count = 0;
  }

  increase(step = 1) {
    this.count += step;
    return this.count;
  }

  fail() {
    throw new Error("boom");
  }
}

defineModule(LoggedCounter, {
  actions: ["increase", "fail"],
  name: "loggedCounter",
  state: ["count"],
});

const entries = [];
const logger = {
  error(message, details) {
    entries.push({
      details,
      level: "error",
      message,
    });
  },
  info(message, details) {
    entries.push({
      details,
      level: "info",
      message,
    });
  },
};
const app = createApp({
  plugins: [createLoggerPlugin({ logger })],
  providers: [LoggedCounter],
});
const counter = app.getModule(LoggedCounter);

counter.increase(2);
expectThrows(() => counter.fail(), "boom", "failing action");

expectArrayEqual(
  entries.map((entry) => entry.level + ":" + entry.message),
  [
    "info:Module created: loggedCounter",
    "info:Action completed: loggedCounter.increase",
    "error:Runtime error during action",
    "error:Action failed: loggedCounter.fail",
  ],
  "logger messages",
);
expectEqual(entries[0].details.name, "loggedCounter", "module event details");
expectEqual(entries[1].details.module, "loggedCounter", "action success module details");
expectEqual(entries[1].details.method, "increase", "action success method details");
expectEqual(entries[3].details.module, "loggedCounter", "action failure module details");
expectEqual(entries[3].details.method, "fail", "action failure method details");
expectEqual(entries[3].details.error.message, "boom", "action failure error details");

await app.dispose();

function expectEqual(actual, expected, label) {
  if (!Object.is(actual, expected)) {
    throw new Error(label + ": expected " + String(expected) + ", got " + String(actual));
  }
}

function expectArrayEqual(actual, expected, label) {
  if (actual.length !== expected.length) {
    throw new Error(
      label + ": expected length " + String(expected.length) + ", got " + String(actual.length),
    );
  }

  for (const [index, value] of actual.entries()) {
    if (!Object.is(value, expected[index])) {
      throw new Error(
        label +
          ": expected index " +
          String(index) +
          " to be " +
          String(expected[index]) +
          ", got " +
          String(value),
      );
    }
  }
}

function expectThrows(callback, message, label) {
  try {
    callback();
  } catch (error) {
    if (error instanceof Error && error.message === message) {
      return error;
    }

    throw new Error(label + ": expected " + message + ", got " + formatError(error));
  }

  throw new Error(label + ": expected an error");
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
