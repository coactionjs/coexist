#!/usr/bin/env node
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPackPackage, lockfilePath, readCatalog, rootDir, run } from "./lib/smoke.ts";

const tempDir = await mkdtemp(join(tmpdir(), "coexist-worker-state-conflict-"));
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

  console.log("Verified installed worker state sections and conflict handling.");
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

async function writeConsumerProject(coreTarball, catalog) {
  await mkdir(consumerDir, { recursive: true });
  await writeFile(
    join(consumerDir, "package.json"),
    `${JSON.stringify(
      {
        name: "coexist-worker-state-conflict-smoke",
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
  createMemoryWorkerTransportPair,
  createWorkerApp,
  createWorkerClient,
  defineModule,
  type WorkerClient,
  type WorkerConflictEvent,
  type WorkerStateMessage,
  type WorkerTransport,
} from "@coexist/core";

class TypeVisibleCounter {
  count = 0;

  increase(step = 1): number {
    this.count += step;
    return this.count;
  }
}

class TypeHiddenState {
  value = "initial";

  set(value: string): string {
    this.value = value;
    return this.value;
  }
}

defineModule(TypeVisibleCounter, {
  actions: ["increase"],
  name: "typeVisibleCounter",
  state: ["count"],
});
defineModule(TypeHiddenState, {
  actions: ["set"],
  name: "typeHiddenState",
  state: ["value"],
});

const [hostTransport, clientTransport]: readonly [WorkerTransport, WorkerTransport] =
  createMemoryWorkerTransportPair();
const conflicts: WorkerConflictEvent[] = [];
const messages: WorkerStateMessage[] = [];
const client: WorkerClient = createWorkerClient({
  onConflict: (event) => {
    conflicts.push(event);
  },
  transport: clientTransport,
});
const host = createWorkerApp({
  providers: [TypeVisibleCounter, TypeHiddenState],
  stateSections: ["typeVisibleCounter"],
  sync: "patch",
  transport: hostTransport,
});

client.subscribe((message) => {
  messages.push(message);
});

await client.ready;
await client.module<TypeVisibleCounter>("typeVisibleCounter").increase(1);

void [conflicts, messages, host.app, client.getState()];
client.dispose();
await host.dispose();
`;
}

function createRuntimeConsumerSource() {
  return `import {
  createMemoryWorkerTransportPair,
  createWorkerApp,
  createWorkerClient,
  defineModule,
} from "@coexist/core";

class VisibleCounter {
  constructor() {
    this.count = 0;
  }

  increase(step = 1) {
    this.count += step;
    return this.count;
  }
}

class HiddenState {
  constructor() {
    this.value = "initial";
  }

  set(value) {
    this.value = value;
    return this.value;
  }
}

defineModule(VisibleCounter, {
  actions: ["increase"],
  name: "visibleCounter",
  state: ["count"],
});
defineModule(HiddenState, {
  actions: ["set"],
  name: "hiddenState",
  state: ["value"],
});

await verifyStateSections();
await verifyConflicts();
await verifyWatchEqualityAndDispose();

async function verifyStateSections() {
  const [hostTransport, clientTransport] = createMemoryWorkerTransportPair();
  const client = createWorkerClient({
    transport: clientTransport,
  });
  const host = createWorkerApp({
    providers: [VisibleCounter, HiddenState],
    stateSections: ["visibleCounter"],
    sync: "patch",
    transport: hostTransport,
  });
  const messages = [];

  client.subscribe((message) => {
    messages.push(message);
  });

  await client.ready;

  expectJsonEqual(client.getState(), { visibleCounter: { count: 0 } }, "sectioned initial state");
  expectJsonEqual(messages.map((message) => message.sections), [["visibleCounter"]], "initial sections");

  await client.module("hiddenState").set("secret");

  expectJsonEqual(client.getState(), { visibleCounter: { count: 0 } }, "hidden section stays hidden");
  expectEqual(messages.length, 1, "hidden state does not publish state message");

  await client.module("visibleCounter").increase(3);

  expectJsonEqual(client.getState(), { visibleCounter: { count: 3 } }, "visible section updates");
  expectEqual(messages.length, 2, "visible state publishes patch");
  expectEqual(messages[1].sync, "patch", "visible update uses patch sync");
  expectJsonEqual(messages[1].sections, ["visibleCounter"], "visible update sections");

  client.dispose();
  await host.dispose();
}

async function verifyConflicts() {
  const [hostTransport, clientTransport] = createMemoryWorkerTransportPair();
  const conflicts = [];
  const invalidMessages = [];
  const client = createWorkerClient({
    onConflict(event) {
      conflicts.push(event);
    },
    onInvalidMessage(message) {
      invalidMessages.push(message);
    },
    transport: clientTransport,
  });

  hostTransport.post({
    patches: [
      {
        op: "replace",
        path: "/visibleCounter/count",
        value: 9,
      },
    ],
    sync: "patch",
    type: "state",
    version: 1,
  });
  hostTransport.post({
    state: {
      visibleCounter: {
        count: 1,
      },
    },
    sync: "snapshot",
    type: "state",
    version: 1,
  });

  await client.ready;

  hostTransport.post({
    state: {
      visibleCounter: {
        count: 0,
      },
    },
    sync: "snapshot",
    type: "state",
    version: 1,
  });
  hostTransport.post({
    patches: [
      {
        op: "replace",
        path: 1,
        value: 9,
      },
    ],
    sync: "patch",
    type: "state",
    version: 2,
  });
  hostTransport.post({
    patches: [
      {
        op: "replace",
        path: "/visibleCounter/count",
        value: 9,
      },
    ],
    sync: "patch",
    type: "state",
    version: 3,
  });

  expectJsonEqual(
    conflicts.map((event) => event.reason),
    ["missing-snapshot", "stale-message", "version-gap"],
    "worker conflict reasons",
  );
  expectJsonEqual(
    conflicts.map((event) => [event.currentVersion, event.incomingVersion]),
    [
      [0, 1],
      [1, 1],
      [1, 3],
    ],
    "worker conflict versions",
  );
  expectEqual(invalidMessages.length, 1, "invalid worker patch messages");
  expectJsonEqual(client.getState(), { visibleCounter: { count: 1 } }, "conflicts keep current snapshot");

  client.dispose();
}

async function verifyWatchEqualityAndDispose() {
  const [hostTransport, clientTransport] = createMemoryWorkerTransportPair();
  const client = createWorkerClient({
    transport: clientTransport,
  });
  const values = [];
  const host = createWorkerApp({
    providers: [VisibleCounter],
    transport: hostTransport,
  });

  await client.ready;

  const unsubscribe = client.watch(
    (state) => ({
      parity: state.visibleCounter.count % 2,
    }),
    (value) => {
      values.push(value);
    },
    {
      equals: (value, previous) => value.parity === previous.parity,
    },
  );

  await client.module("visibleCounter").increase(2);
  await client.module("visibleCounter").increase(1);

  expectJsonEqual(values, [{ parity: 1 }], "worker watch equality");

  unsubscribe();
  await client.module("visibleCounter").increase(1);
  expectJsonEqual(values, [{ parity: 1 }], "worker watch unsubscribe");

  client.dispose();
  await host.dispose();

  const [, disposedClientTransport] = createMemoryWorkerTransportPair();
  const disposedClient = createWorkerClient({
    transport: disposedClientTransport,
  });
  const pending = disposedClient.call("visibleCounter", "increase", 1);

  disposedClient.dispose();
  await expectRejects(pending, "Worker client disposed before response.", "disposed pending call");
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
