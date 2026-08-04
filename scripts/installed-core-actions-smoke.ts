#!/usr/bin/env node
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPackPackage, lockfilePath, readCatalog, rootDir, run } from "./lib/smoke.ts";

const tempDir = await mkdtemp(join(tmpdir(), "coexist-core-actions-"));
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

  console.log("Verified installed core action runtime.");
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

async function writeConsumerProject(coreTarball, catalog) {
  await mkdir(consumerDir, { recursive: true });
  await writeFile(
    join(consumerDir, "package.json"),
    `${JSON.stringify(
      {
        name: "coexist-core-actions-smoke",
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
  CoexistError,
  createApp,
  defineModule,
  runInAction,
  type ActionEvent,
  type ErrorContext,
  type Plugin,
} from "@coexist/core";

class TypeActionCounter {
  count = 0;

  increase(step = 1): number {
    this.count += step;
    return this.count;
  }
}

defineModule(TypeActionCounter, {
  actions: ["increase"],
  name: "typeActionCounter",
  state: ["count"],
});

const events: ActionEvent[] = [];
const errors: ErrorContext[] = [];
const plugin: Plugin = {
  onActionEnd(event) {
    events.push(event);
  },
  onError(_error, context) {
    errors.push(context);
  },
};
const app = createApp({
  devOptions: {
    strictActions: true,
  },
  plugins: [plugin],
  providers: [TypeActionCounter],
});
const counter = app.getModule(TypeActionCounter);
const tokenResult: number = app.runInAction(
  TypeActionCounter,
  () => {
    counter.count = 1;
    return counter.count;
  },
  { name: "typeTokenAction" },
);
const instanceResult: number = runInAction(
  counter,
  () => {
    counter.count += 1;
    return counter.count;
  },
  { name: "typeInstanceAction" },
);

try {
  counter.count = 3;
} catch (error) {
  if (!(error instanceof CoexistError)) {
    throw error;
  }
}

void [app, events, errors, instanceResult, tokenResult];
`;
}

function createRuntimeConsumerSource() {
  return `import {
  CoexistError,
  createApp,
  defineModule,
  runInAction,
} from "@coexist/core";

class ActionCounter {
  constructor() {
    this.count = 0;
  }

  increase(step = 1) {
    this.count += step;
    return this.count;
  }

  async increaseLater(step = 1) {
    this.count += step;
    await tick();
    return this.count;
  }
}

defineModule(ActionCounter, {
  actions: ["increase", "increaseLater"],
  name: "actionCounter",
  state: ["count"],
});

class PostAwaitWriter {
  constructor() {
    this.count = 0;
  }

  async writeLater() {
    await tick();
    this.count = 1;
  }

  async writeWithBoundary() {
    await tick();

    return runInAction(
      this,
      () => {
        this.count = 2;
        return this.count;
      },
      {
        name: "writeLater.commit",
      },
    );
  }
}

defineModule(PostAwaitWriter, {
  actions: ["writeLater", "writeWithBoundary"],
  name: "postAwaitWriter",
  state: ["count"],
});

class AsyncFailingAction {
  async failLater() {
    await tick();
    throw new Error("async boom");
  }
}

defineModule(AsyncFailingAction, {
  actions: ["failLater"],
  name: "asyncFailingAction",
});

const starts = [];
const ends = [];
const errors = [];
const states = [];
const app = createApp({
  devOptions: {
    strictActions: true,
  },
  plugins: [
    {
      onActionEnd(event) {
        ends.push({
          error: event.error instanceof Error ? event.error.message : null,
          method: event.method,
          module: event.module,
        });
      },
      onActionStart(event) {
        starts.push(event.module + "." + event.method);
      },
      onError(error, context) {
        errors.push(context.phase + ":" + (error instanceof Error ? error.message : String(error)));
      },
      onStateChange(event) {
        states.push(event.state);
      },
    },
  ],
  providers: [ActionCounter, PostAwaitWriter, AsyncFailingAction],
});
const counter = app.getModule(ActionCounter);
const writer = app.getModule(PostAwaitWriter);
const failing = app.getModule(AsyncFailingAction);
const pureState = app.store.getPureState();

expectThrowsInstance(
  () => {
    pureState.actionCounter.count = 99;
  },
  TypeError,
  "strict pure state snapshot rejects writes",
);
expectEqual(counter.count, 0, "strict pure state write leaves module unchanged");

expectThrowsInstance(
  () => {
    counter.count = 10;
  },
  CoexistError,
  "strict action rejects direct writes",
);

expectEqual(counter.increase(2), 2, "sync action result");
expectEqual(counter.count, 2, "sync action state");
expectEqual(await counter.increaseLater(3), 5, "async action result");
expectEqual(counter.count, 5, "async action state");

app.runInAction(
  ActionCounter,
  () => {
    counter.count = 6;
  },
  { name: "setByToken" },
);
app.runInAction(
  "actionCounter",
  () => {
    counter.count = 7;
  },
  { name: "setByName" },
);
app.runInAction(
  counter,
  () => {
    counter.count = 8;
  },
  { name: "setByInstance" },
);
expectEqual(counter.count, 8, "app runInAction targets");

await expectRejects(writer.writeLater(), "Cannot write postAwaitWriter.count outside an action.", "post-await strict write");
expectEqual(writer.count, 0, "failed post-await write rolls back");
expectEqual(await writer.writeWithBoundary(), 2, "post-await runInAction result");
expectEqual(writer.count, 2, "post-await runInAction state");

await expectRejects(failing.failLater(), "async boom", "async failing action");
expectThrowsInstance(
  () => runInAction({}, () => undefined),
  CoexistError,
  "global runInAction rejects unknown modules",
);

expectJsonEqual(
  starts,
  [
    "actionCounter.increase",
    "actionCounter.increaseLater",
    "actionCounter.setByToken",
    "actionCounter.setByName",
    "actionCounter.setByInstance",
    "postAwaitWriter.writeLater",
    "postAwaitWriter.writeWithBoundary",
    "postAwaitWriter.writeLater.commit",
    "asyncFailingAction.failLater",
  ],
  "action start order",
);
expectJsonEqual(
  ends.map((event) => event.module + "." + event.method + ":" + (event.error ?? "ok")),
  [
    "actionCounter.increase:ok",
    "actionCounter.increaseLater:ok",
    "actionCounter.setByToken:ok",
    "actionCounter.setByName:ok",
    "actionCounter.setByInstance:ok",
    "postAwaitWriter.writeLater:Cannot write postAwaitWriter.count outside an action.",
    "postAwaitWriter.writeLater.commit:ok",
    "postAwaitWriter.writeWithBoundary:ok",
    "asyncFailingAction.failLater:async boom",
  ],
  "action end order",
);
expectJsonEqual(
  errors,
  [
    "action:Cannot write postAwaitWriter.count outside an action.",
    "action:async boom",
  ],
  "plugin action errors",
);
expectJsonEqual(
  states.at(-1),
  {
    actionCounter: {
      count: 8,
    },
    postAwaitWriter: {
      count: 2,
    },
    asyncFailingAction: {},
  },
  "final state change",
);

await app.dispose();

function tick() {
  return Promise.resolve();
}

async function expectRejects(promise, message, label) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error && error.message.includes(message)) {
      return error;
    }

    throw new Error(label + ": expected " + message + ", got " + formatError(error));
  }

  throw new Error(label + ": expected rejection");
}

function expectThrowsInstance(callback, ExpectedError, label) {
  try {
    callback();
  } catch (error) {
    if (error instanceof ExpectedError) {
      return error;
    }

    throw new Error(label + ": expected " + ExpectedError.name + ", got " + formatError(error));
  }

  throw new Error(label + ": expected " + ExpectedError.name + " to be thrown");
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
