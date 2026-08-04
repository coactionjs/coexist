#!/usr/bin/env node
import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { rootDir, run } from "./lib/smoke.ts";

const cliPath = join(rootDir, "packages/create/dist/cli.mjs");
const corePackageDir = join(rootDir, "packages/core");
const tempDir = await mkdtemp(join(tmpdir(), "coexist-create-runtime-"));
const appName = "runtime-demo";
const appDir = join(tempDir, appName);

try {
  const createResult = await run(process.execPath, [cliPath, appName], tempDir);
  const createdPath = createResult.stdout.trim().replace("Created Coexist project at ", "");
  const [actualAppDir, reportedAppDir] = await Promise.all([
    realpath(appDir),
    realpath(createdPath),
  ]);

  if (reportedAppDir !== actualAppDir) {
    throw new Error(`create-coexist CLI printed unexpected output:\n${createResult.stdout}`);
  }

  await mkdir(join(appDir, "node_modules", "@coexist"), { recursive: true });
  await symlink(corePackageDir, join(appDir, "node_modules", "@coexist/core"), "dir");

  const runResult = await run(process.execPath, ["src/main.ts"], appDir);

  if (!runResult.stdout.includes("{ counter: { count: 1 } }")) {
    throw new Error(`Generated project printed unexpected output:\n${runResult.stdout}`);
  }

  console.log("Verified generated project runtime execution.");
} finally {
  await rm(tempDir, { force: true, recursive: true });
}
