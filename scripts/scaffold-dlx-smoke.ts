#!/usr/bin/env node
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPackPackage, lockfilePath, readCatalog, run } from "./lib/smoke.ts";

const tempDir = await mkdtemp(join(tmpdir(), "coexist-scaffold-dlx-"));
const tarballsDir = join(tempDir, "tarballs");
const packPackage = createPackPackage(tarballsDir);
const workspaceDir = join(tempDir, "workspace");
const appName = "dlx-scaffold";
const appDir = join(workspaceDir, appName);

try {
  const catalog = await readCatalog();
  const createTarball = await packPackage("@coexist/create");
  const coreTarball = await packPackage("@coexist/core");

  await mkdir(workspaceDir, { recursive: true });

  const createResult = await run(
    "pnpm",
    ["dlx", "--package", `file:${createTarball}`, "create-coexist", appName],
    workspaceDir,
  );
  const createdPath = createResult.stdout.trim().replace("Created Coexist project at ", "");
  const [expectedAppDir, reportedAppDir] = await Promise.all([
    realpath(appDir),
    realpath(createdPath),
  ]);

  if (reportedAppDir !== expectedAppDir) {
    throw new Error(
      `pnpm dlx create-coexist reported unexpected app path:\n${createResult.stdout}`,
    );
  }

  await writeGeneratedAppOverrides(coreTarball, catalog);
  await run("pnpm", ["install", "--prefer-offline", "--no-frozen-lockfile"], appDir);
  await run("pnpm", ["run", "build"], appDir);

  const startResult = await run("pnpm", ["run", "start"], appDir);

  if (!startResult.stdout.includes("{ counter: { count: 1 } }")) {
    throw new Error(`pnpm dlx generated app printed unexpected output:\n${startResult.stdout}`);
  }

  console.log("Verified pnpm dlx create-coexist scaffold build and runtime.");
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

async function writeGeneratedAppOverrides(coreTarball, catalog) {
  await writeFile(join(appDir, "pnpm-lock.yaml"), await readFile(lockfilePath, "utf8"));
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

function readCatalogVersion(catalog, name) {
  const version = catalog.get(name);

  if (version === undefined) {
    throw new Error(`${name} is missing from pnpm-workspace.yaml catalog.`);
  }

  return version;
}
