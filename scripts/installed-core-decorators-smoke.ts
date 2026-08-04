#!/usr/bin/env node
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPackPackage, lockfilePath, readCatalog, rootDir, run } from "./lib/smoke.ts";

const tempDir = await mkdtemp(join(tmpdir(), "coexist-core-decorators-"));
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
  await run(process.execPath, ["dist/index.js"], consumerDir);

  console.log("Verified installed core decorator runtime.");
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

async function writeConsumerProject(coreTarball, catalog) {
  await mkdir(join(consumerDir, "src"), { recursive: true });
  await writeFile(
    join(consumerDir, "package.json"),
    `${JSON.stringify(
      {
        name: "coexist-core-decorators-smoke",
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
          exactOptionalPropertyTypes: true,
          lib: ["ES2023", "ESNext.Decorators"],
          module: "NodeNext",
          moduleResolution: "NodeNext",
          outDir: "dist",
          rootDir: "src",
          skipLibCheck: true,
          strict: true,
          target: "ES2022",
        },
        include: ["src/index.ts"],
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(join(consumerDir, "src/index.ts"), createDecoratorConsumerSource());
}

function createDecoratorConsumerSource() {
  return `import {
  Action,
  Computed,
  Effect,
  Module,
  State,
  createApp,
  provide,
} from "@coexist/core";

abstract class Logger {
  abstract info(message: string): void;
}

class MemoryLogger implements Logger {
  readonly messages: string[] = [];

  info(message: string): void {
    this.messages.push(message);
  }
}

@Module({
  deps: [Logger],
  name: "decoratorCounter",
})
class DecoratorCounter {
  constructor(readonly logger: Logger) {}

  @State
  accessor count = 0;

  @Computed
  get double(): number {
    return this.count * 2;
  }

  @Action
  increase(step = 1): number {
    this.count += step;
    this.logger.info("count:" + String(this.count));
    return this.count;
  }

  @Effect
  recordCount(): void {
    this.logger.info("effect:" + String(this.count));
  }
}

const logger = new MemoryLogger();
const app = createApp({
  providers: [DecoratorCounter, provide(Logger, { useValue: logger })],
});
const counter = app.getModule(DecoratorCounter);
const watchedDoubles: number[] = [];
const unwatch = app.watch(
  () => counter.double,
  (value) => {
    watchedDoubles.push(value);
  },
);

await app.start();
await waitFor(() => logger.messages.includes("effect:0"), "initial effect");

expectEqual(counter.count, 0, "initial state accessor");
expectEqual(counter.double, 0, "initial computed getter");
expectJsonEqual(app.store.getPureState(), { decoratorCounter: { count: 0 } }, "initial store state");

expectEqual(counter.increase(2), 2, "action return value");
await waitFor(() => logger.messages.includes("effect:2"), "updated effect");

expectEqual(counter.count, 2, "state accessor after action");
expectEqual(counter.double, 4, "computed getter after action");
expectJsonEqual(app.store.getPureState(), { decoratorCounter: { count: 2 } }, "updated store state");
expectJsonEqual(watchedDoubles, [4], "watch observes decorated computed");
expectJsonEqual(logger.messages, ["effect:0", "count:2", "effect:2"], "decorator logger messages");

unwatch();
await app.dispose();

function expectEqual(actual: unknown, expected: unknown, label: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(label + ": expected " + String(expected) + ", got " + String(actual));
  }
}

function expectJsonEqual(actual: unknown, expected: unknown, label: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(label + ": expected " + expectedJson + ", got " + actualJson);
  }
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt > 1000) {
      throw new Error("Timed out waiting for " + label + ".");
    }

    await Promise.resolve();
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
