#!/usr/bin/env node
/* eslint-disable no-await-in-loop, no-underscore-dangle -- Release scenarios and workspace copies run sequentially; the Changesets option is named with leading underscores. */
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const changesetBin = join(rootDir, "node_modules/.bin/changeset");
const tempDir = await mkdtemp(join(tmpdir(), "coexist-release-plan-"));

try {
  const publicPackages = await readPublicPackages();
  const publicNames = publicPackages.map((pkg) => pkg.name).toSorted();
  const config = JSON.parse(await readFile(join(rootDir, ".changeset/config.json"), "utf8"));
  const fixed = config.fixed?.[0];

  if (config.fixed?.length !== 1 || !sameNames(fixed, publicNames)) {
    throw new Error("The Changesets fixed group must contain every public package exactly once.");
  }

  if (
    config.___experimentalUnsafeOptions_WILL_CHANGE_IN_PATCH
      ?.onlyUpdatePeerDependentsWhenOutOfRange !== true
  ) {
    throw new Error("Peer dependents must not receive major bumps inside the fixed group.");
  }

  for (const [bump, expectedVersion] of [
    ["patch", "1.0.2"],
    ["minor", "1.1.0"],
    ["major", "2.0.0"],
  ]) {
    const dir = join(tempDir, bump);
    await copyWorkspaceManifests(dir);
    await mkdir(join(dir, ".changeset"), { recursive: true });
    await writeFile(join(dir, ".changeset/config.json"), JSON.stringify(config));
    await runGit(dir, ["init", "-b", "main"]);
    await runGit(dir, ["add", "."]);
    await runGit(dir, [
      "-c",
      "user.name=Release Plan Smoke",
      "-c",
      "user.email=release-plan@example.invalid",
      "commit",
      "-qm",
      "Temporary release fixture",
    ]);
    await writeFile(
      join(dir, ".changeset/smoke.md"),
      `---\n"@coexist/core": ${bump}\n---\n\nVerify fixed-package planning.\n`,
    );

    const planPath = join(dir, "plan.json");
    await run(changesetBin, ["status", "--output", planPath], { cwd: dir });
    const plan = JSON.parse(await readFile(planPath, "utf8"));
    assertPublicVersions(plan.releases, publicNames, expectedVersion, `${bump} plan`);

    if (bump === "minor") {
      await run(changesetBin, ["version"], { cwd: dir });

      for (const pkg of publicPackages) {
        const manifest = JSON.parse(
          await readFile(join(dir, "packages", pkg.directory, "package.json"), "utf8"),
        );

        if (manifest.version !== expectedVersion) {
          throw new Error(`${pkg.name} was versioned to ${manifest.version}, expected 1.1.0.`);
        }

        if (
          manifest.peerDependencies?.["@coexist/core"] !== undefined &&
          manifest.peerDependencies["@coexist/core"] !== "workspace:^"
        ) {
          throw new Error(`${pkg.name} lost its workspace:^ core peer range.`);
        }
      }
    }
  }

  const currentPlanPath = join(tempDir, "current-plan.json");
  await run(changesetBin, ["status", "--output", currentPlanPath], { cwd: rootDir });
  const currentPlan = JSON.parse(await readFile(currentPlanPath, "utf8"));
  const currentPublic = currentPlan.releases.filter((item) => publicNames.includes(item.name));

  if (currentPublic.length > 0) {
    const versions = new Set(currentPublic.map((item) => item.newVersion));

    if (currentPublic.length !== publicNames.length || versions.size !== 1) {
      throw new Error("Pending changesets do not plan one version for every public package.");
    }
  }

  console.log(
    `Verified patch, minor, and major lockstep plans for ${publicNames.length} packages.`,
  );
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

async function readPublicPackages() {
  const packages = [];

  for (const entry of await readdir(join(rootDir, "packages"), { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const manifest = JSON.parse(
      await readFile(join(rootDir, "packages", entry.name, "package.json"), "utf8"),
    );

    if (manifest.private !== true) {
      packages.push({ directory: entry.name, name: manifest.name });
    }
  }

  return packages;
}

async function copyWorkspaceManifests(dir) {
  await mkdir(dir, { recursive: true });

  for (const name of ["package.json", "pnpm-workspace.yaml"]) {
    await copyFile(join(rootDir, name), join(dir, name));
  }

  for (const group of ["packages", "examples"]) {
    for (const entry of await readdir(join(rootDir, group), { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const source = join(rootDir, group, entry.name, "package.json");
      const target = join(dir, group, entry.name, "package.json");
      await mkdir(dirname(target), { recursive: true });
      await copyFile(source, target);
    }
  }
}

async function runGit(dir, args) {
  await run("git", args, { cwd: dir });
}

function assertPublicVersions(releases, publicNames, expectedVersion, label) {
  const actual = releases
    .filter((item) => publicNames.includes(item.name))
    .map((item) => [item.name, item.newVersion]);

  if (
    !sameNames(
      actual.map(([name]) => name),
      publicNames,
    ) ||
    actual.some(([, version]) => version !== expectedVersion)
  ) {
    throw new Error(`${label} did not produce ${expectedVersion} for every public package.`);
  }
}

function sameNames(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.toSorted().every((name, index) => name === expected[index])
  );
}
