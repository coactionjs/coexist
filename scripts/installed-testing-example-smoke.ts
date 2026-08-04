#!/usr/bin/env node
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import {
  createPackPackage,
  lockfilePath,
  packagesDir,
  readCatalog,
  rootDir,
  run,
} from "./lib/smoke.ts";

const rootPackagePath = join(rootDir, "package.json");
const sourceExampleDir = join(rootDir, "examples", "testing");
const tempDir = await mkdtemp(join(tmpdir(), "coexist-installed-testing-example-"));
const exampleDir = join(tempDir, "examples", "testing");
const tarballsDir = join(tempDir, "tarballs");
const packPackage = createPackPackage(tarballsDir);

try {
  const catalog = await readCatalog();
  const rootPackageJson = JSON.parse(await readFile(rootPackagePath, "utf8"));
  const coreTarball = await packPackage("@coexist/core");
  const testingTarball = await packPackage("@coexist/testing");

  await writeInstalledTestingExample(coreTarball, testingTarball, catalog, rootPackageJson);
  await run("pnpm", ["install", "--prefer-offline", "--no-frozen-lockfile"], tempDir);
  await run("pnpm", ["--filter", "@coexist/example-testing", "run", "typecheck"], tempDir);
  await run("pnpm", ["--filter", "@coexist/example-testing", "run", "test"], tempDir);

  console.log("Verified installed @coexist/testing example test suite.");
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

async function writeInstalledTestingExample(coreTarball, testingTarball, catalog, rootPackageJson) {
  await mkdir(join(tempDir, "examples"), { recursive: true });
  await mkdir(join(tempDir, "packages"), { recursive: true });
  await cp(join(packagesDir, "tsconfig"), join(tempDir, "packages", "tsconfig"), {
    recursive: true,
  });
  await cp(sourceExampleDir, exampleDir, {
    filter(source) {
      const name = basename(source);
      return name !== "node_modules" && name !== ".turbo" && name !== "coverage";
    },
    recursive: true,
  });

  const packageJson = JSON.parse(await readFile(join(sourceExampleDir, "package.json"), "utf8"));

  await writeFile(
    join(exampleDir, "package.json"),
    `${JSON.stringify(
      {
        ...packageJson,
        dependencies: {
          ...rewriteDependencyField(packageJson.dependencies, catalog),
          "@coexist/core": `file:${coreTarball}`,
          "@coexist/testing": `file:${testingTarball}`,
        },
        devDependencies: rewriteDependencyField(packageJson.devDependencies, catalog),
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(tempDir, "package.json"),
    `${JSON.stringify(
      {
        name: "coexist-installed-testing-example-smoke",
        packageManager: rootPackageJson.packageManager,
        private: true,
        type: "module",
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(join(tempDir, "pnpm-lock.yaml"), await readFile(lockfilePath, "utf8"));
  await writeFile(
    join(tempDir, "pnpm-workspace.yaml"),
    [
      "minimumReleaseAgeExclude:",
      `  - ${JSON.stringify(`coaction@${readCatalogVersion(catalog, "coaction")}`)}`,
      "packages:",
      '  - "examples/*"',
      "allowBuilds:",
      '  "@parcel/watcher": true',
      "  esbuild: true",
      "overrides:",
      `  "@coexist/core": ${JSON.stringify(`file:${coreTarball}`)}`,
      `  "@coexist/testing": ${JSON.stringify(`file:${testingTarball}`)}`,
      `  "coaction": ${JSON.stringify(readCatalogVersion(catalog, "coaction"))}`,
      `  "typescript": ${JSON.stringify(readCatalogVersion(catalog, "typescript"))}`,
      `  "vite": ${JSON.stringify(readCatalogVersion(catalog, "vite"))}`,
      `  "vitest": ${JSON.stringify(readCatalogVersion(catalog, "vitest"))}`,
      "",
    ].join("\n"),
  );
}

function rewriteDependencyField(dependencies, catalog) {
  if (dependencies === undefined) {
    return undefined;
  }

  const rewritten = {};

  for (const [name, range] of Object.entries(dependencies)) {
    rewritten[name] = range === "catalog:" ? readCatalogVersion(catalog, name) : range;
  }

  return rewritten;
}

function readCatalogVersion(catalog, name) {
  const version = catalog.get(name);

  if (version === undefined) {
    throw new Error(`${name} is missing from pnpm-workspace.yaml catalog.`);
  }

  return version;
}
