#!/usr/bin/env node
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPackPackage, lockfilePath, readCatalog, run } from "./lib/smoke.ts";

const tempDir = await mkdtemp(join(tmpdir(), "coexist-scaffold-install-"));
const tarballsDir = join(tempDir, "tarballs");
const packPackage = createPackPackage(tarballsDir);
const cliConsumerDir = join(tempDir, "cli-consumer");
const appName = "installed-scaffold";
const appDir = join(cliConsumerDir, appName);

try {
  const catalog = await readCatalog();
  const createTarball = await packPackage("@coexist/create");
  const coreTarball = await packPackage("@coexist/core");

  await writeCliConsumer(createTarball, catalog);
  await run(
    "pnpm",
    ["install", "--prefer-offline", "--no-frozen-lockfile", "--ignore-scripts"],
    cliConsumerDir,
  );

  const createResult = await run("pnpm", ["exec", "create-coexist", appName], cliConsumerDir);
  const createdPath = createResult.stdout.trim().replace("Created Coexist project at ", "");
  const [expectedAppDir, reportedAppDir] = await Promise.all([
    realpath(appDir),
    realpath(createdPath),
  ]);

  if (reportedAppDir !== expectedAppDir) {
    throw new Error(`create-coexist reported unexpected app path:\n${createResult.stdout}`);
  }

  await writeGeneratedAppOverrides(coreTarball, catalog);
  await run("pnpm", ["install", "--prefer-offline", "--no-frozen-lockfile"], appDir);
  await run("pnpm", ["run", "build"], appDir);

  const startResult = await run("pnpm", ["run", "start"], appDir);

  if (!startResult.stdout.includes("{ counter: { count: 1 } }")) {
    throw new Error(`Generated app printed unexpected output:\n${startResult.stdout}`);
  }

  console.log("Verified installed create-coexist scaffold build and runtime.");
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

async function writeCliConsumer(createTarball, catalog) {
  await mkdir(cliConsumerDir, { recursive: true });
  await writeFile(
    join(cliConsumerDir, "package.json"),
    `${JSON.stringify(
      {
        name: "coexist-scaffold-cli-consumer",
        private: true,
        type: "module",
        dependencies: {
          "@coexist/create": `file:${createTarball}`,
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(cliConsumerDir, "pnpm-workspace.yaml"),
    [
      "minimumReleaseAgeExclude:",
      `  - ${JSON.stringify(`coaction@${readCatalogVersion(catalog, "coaction")}`)}`,
      "",
    ].join("\n"),
  );
  await copyLockfile(cliConsumerDir);
}

async function writeGeneratedAppOverrides(coreTarball, catalog) {
  await copyLockfile(appDir);
  await writeFile(
    join(appDir, "pnpm-workspace.yaml"),
    [
      "minimumReleaseAgeExclude:",
      `  - ${JSON.stringify(`coaction@${readCatalogVersion(catalog, "coaction")}`)}`,
      "allowBuilds:",
      "  esbuild: true",
      "overrides:",
      `  "@coexist/core": ${JSON.stringify(`file:${coreTarball}`)}`,
      `  "tsx": ${JSON.stringify(readCatalogVersion(catalog, "tsx"))}`,
      `  "typescript": ${JSON.stringify(readCatalogVersion(catalog, "typescript"))}`,
      "",
    ].join("\n"),
  );
}

async function copyLockfile(dir) {
  await writeFile(join(dir, "pnpm-lock.yaml"), await readFile(lockfilePath, "utf8"));
}

function readCatalogVersion(catalog, name) {
  const version = catalog.get(name);

  if (version === undefined) {
    throw new Error(`${name} is missing from pnpm-workspace.yaml catalog.`);
  }

  return version;
}
