#!/usr/bin/env node
/* eslint-disable no-await-in-loop */
// Verifies the *lower* bound of every adapter's framework peer range.
//
// A peer range is a compatibility claim, and CI otherwise only ever exercises
// the newest version in each one — `react@19` for `^18.3.0 || ^19.0.0`,
// `@angular/core@22` for `>=17.0.0 <23`. An adapter that reaches for an API
// added after the lower bound would ship a range it cannot honour, and the
// first person to find out would be a user on the older version.
//
// The workspace itself cannot host a second version of a framework:
// `catalogMode: strict` plus one lockfile pin exactly one. So each adapter gets
// a throwaway consumer project outside the workspace, which is free to install
// whatever its peer range's floor is, and the adapter is typechecked and
// imported against it.
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPackPackage, packagesDir, readCatalog, rootDir, run } from "./lib/smoke.ts";

/**
 * Each adapter, the peer whose floor is under test, and the extra packages that
 * peer needs at a matching version. `source` names the file the consumer
 * typechecks so a missing API fails here rather than in a user's build.
 */
const adapters = [
  {
    name: "@coexist/angular",
    peer: "@angular/core",
    companions: { rxjs: "catalog:" },
    source: `import { createApp, defineModule } from "@coexist/core";
import {
  injectCoexistApp,
  injectModule,
  injectSignal,
  injectWorkerModule,
  injectWorkerSignal,
  provideCoexist,
  provideWorkerClient,
} from "@coexist/angular";

void [
  createApp,
  defineModule,
  injectCoexistApp,
  injectModule,
  injectSignal,
  injectWorkerModule,
  injectWorkerSignal,
  provideCoexist,
  provideWorkerClient,
];
`,
  },
  {
    name: "@coexist/react",
    peer: "react",
    companions: {},
    typesFor: "@types/react",
    source: `import { createApp } from "@coexist/core";
import {
  CoexistProvider,
  useApp,
  useModule,
  useSelector,
  useWorkerModule,
  useWorkerSelector,
  WorkerClientProvider,
} from "@coexist/react";

void [
  createApp,
  CoexistProvider,
  useApp,
  useModule,
  useSelector,
  useWorkerModule,
  useWorkerSelector,
  WorkerClientProvider,
];
`,
  },
  {
    name: "@coexist/solid",
    peer: "solid-js",
    companions: {},
    source: `import { createApp } from "@coexist/core";
import {
  CoexistProvider,
  useApp,
  useComputed,
  useModule,
  useWorkerModule,
  useWorkerSelector,
  WorkerClientProvider,
} from "@coexist/solid";

void [
  createApp,
  CoexistProvider,
  useApp,
  useComputed,
  useModule,
  useWorkerModule,
  useWorkerSelector,
  WorkerClientProvider,
];
`,
  },
  {
    name: "@coexist/svelte",
    peer: "svelte",
    companions: {},
    source: `import { createApp } from "@coexist/core";
import {
  getCoexistApp,
  moduleStore,
  selectedModuleStore,
  setCoexistApp,
  workerModuleStore,
  workerSelectorStore,
} from "@coexist/svelte";

void [
  createApp,
  getCoexistApp,
  moduleStore,
  selectedModuleStore,
  setCoexistApp,
  workerModuleStore,
  workerSelectorStore,
];
`,
  },
  {
    name: "@coexist/vue",
    peer: "vue",
    companions: {},
    source: `import { createApp } from "@coexist/core";
import {
  coexistPlugin,
  provideCoexist,
  useComputed,
  useModule,
  useSelector,
  useWorkerModule,
  useWorkerSelector,
  workerClientPlugin,
} from "@coexist/vue";

void [
  createApp,
  coexistPlugin,
  provideCoexist,
  useComputed,
  useModule,
  useSelector,
  useWorkerModule,
  useWorkerSelector,
  workerClientPlugin,
];
`,
  },
];

const tempDir = await mkdtemp(join(tmpdir(), "coexist-framework-min-version-"));
const tarballsDir = join(tempDir, "tarballs");
const packPackage = createPackPackage(tarballsDir);
const tscBin = join(rootDir, "node_modules/.bin/tsc");

try {
  const catalog = await readCatalog();
  const coreTarball = await packPackage("@coexist/core");
  const verified = [];

  for (const adapter of adapters) {
    const range = await readPeerRange(adapter.name, adapter.peer);
    const minimum = lowestVersionInRange(range);
    const adapterTarball = await packPackage(adapter.name);
    const consumerDir = join(tempDir, adapter.name.replace("@coexist/", ""));

    await writeConsumer({ adapter, adapterTarball, catalog, consumerDir, coreTarball, minimum });
    await run(
      "pnpm",
      ["install", "--prefer-offline", "--no-frozen-lockfile", "--ignore-scripts"],
      consumerDir,
    );
    await assertInstalledVersion(consumerDir, adapter.peer, minimum);
    await run(tscBin, ["-p", "tsconfig.json"], consumerDir);

    verified.push(`${adapter.name} against ${adapter.peer}@${minimum} (range ${range})`);
  }

  console.log(`Verified ${verified.length} adapter peer-range floor(s):`);

  for (const line of verified) {
    console.log(`  ${line}`);
  }
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

async function readPeerRange(packageName, peer) {
  const dir = join(packagesDir, packageName.slice("@coexist/".length));
  const manifest = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
  const range = manifest.peerDependencies?.[peer];

  if (typeof range !== "string") {
    throw new Error(`${packageName} does not declare a peer range for ${peer}.`);
  }

  return range;
}

/**
 * The lowest version any alternative of a range admits. `^18.3.0 || ^19.0.0`
 * floors at 18.3.0, `>=17.0.0 <23` at 17.0.0. Only the forms this repo uses are
 * supported — an unrecognised range is an error rather than a silent skip,
 * because skipping would quietly stop testing the bound.
 */
function lowestVersionInRange(range) {
  const alternatives = range.split("||").map((part) => part.trim());
  const versions = [];

  for (const alternative of alternatives) {
    const match = /^(?:\^|>=|~)?\s*(\d+\.\d+\.\d+)/.exec(alternative);

    if (match === null) {
      throw new Error(`Cannot read a lower bound from the peer range ${JSON.stringify(range)}.`);
    }

    versions.push(match[1]);
  }

  return versions.toSorted(compareVersions)[0];
}

function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }

  return 0;
}

/** Guards against a resolver quietly upgrading past the floor under test. */
async function assertInstalledVersion(consumerDir, peer, expected) {
  const manifestPath = join(consumerDir, "node_modules", peer, "package.json");
  const installed = JSON.parse(await readFile(manifestPath, "utf8")).version;

  if (installed !== expected) {
    throw new Error(
      `Expected ${peer}@${expected} in ${consumerDir}, but ${installed} was installed. ` +
        "The floor of the peer range was not the version under test.",
    );
  }
}

async function writeConsumer({
  adapter,
  adapterTarball,
  catalog,
  consumerDir,
  coreTarball,
  minimum,
}) {
  const dependencies = {
    "@coexist/core": `file:${coreTarball}`,
    [adapter.name]: `file:${adapterTarball}`,
    [adapter.peer]: minimum,
  };

  for (const [name, version] of Object.entries(adapter.companions)) {
    dependencies[name] = version === "catalog:" ? readCatalogVersion(catalog, name) : version;
  }

  const devDependencies = {
    typescript: readCatalogVersion(catalog, "typescript"),
  };

  if (adapter.typesFor !== undefined) {
    // Types track the runtime major, so pin them to the floor's major too.
    devDependencies[adapter.typesFor] = `^${minimum.split(".")[0]}`;
  }

  await mkdir(consumerDir, { recursive: true });
  await writeFile(
    join(consumerDir, "package.json"),
    `${JSON.stringify(
      {
        name: `coexist-min-version-${adapter.peer.replaceAll(/[^a-z0-9]+/g, "-")}`,
        private: true,
        type: "module",
        dependencies: sortObject(dependencies),
        devDependencies: sortObject(devDependencies),
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(consumerDir, "pnpm-workspace.yaml"),
    [
      "minimumReleaseAgeExclude:",
      `  - ${JSON.stringify(`coaction@${readCatalogVersion(catalog, "coaction")}`)}`,
      // The floor is the point of the test, so nothing may be hoisted past it.
      "overrides:",
      `  ${JSON.stringify(adapter.peer)}: ${JSON.stringify(minimum)}`,
      "",
    ].join("\n"),
  );
  await writeFile(
    join(consumerDir, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          jsx: "preserve",
          lib: ["DOM", "DOM.Iterable", "ES2023"],
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
  await writeFile(join(consumerDir, "index.ts"), adapter.source);
}

function readCatalogVersion(catalog, name) {
  const version = catalog.get(name);

  if (version === undefined) {
    throw new Error(`${name} is missing from the pnpm-workspace.yaml catalog.`);
  }

  return version;
}

function sortObject(value) {
  return Object.fromEntries(
    Object.entries(value).toSorted(([left], [right]) => left.localeCompare(right)),
  );
}
