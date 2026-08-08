#!/usr/bin/env node
/* eslint-disable no-await-in-loop */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packagesDir = join(rootDir, "packages");
const publishDir = join(rootDir, ".publish");
const registry = normalizeRegistry(
  process.env.NPM_CONFIG_REGISTRY ?? "https://registry.npmjs.org/",
);
const dryRun = process.argv.includes("--dry-run");
const releaseTag = process.env.NPM_TAG ?? (await readPrereleaseTag()) ?? "latest";

const publishablePackages = sortPackages(await readWorkspacePackages());
const published = [];
const skipped = [];

// Publishing is a loop of independent `npm publish` calls with no transaction
// behind it, so the first failure leaves every package after it unpublished —
// a release that is half on npm and half not, with the adapters pinned to a
// core version that never shipped. That is not hypothetical: a release died on
// a version number that had been unpublished (npm never lets one be reused),
// and the three packages ahead of it in dependency order went out alone.
//
// Every predictable reason a publish would be rejected is knowable before the
// first one runs, so check them all first and refuse the whole release rather
// than discover the problem a third of the way through it.
const plan = await planRelease(publishablePackages);

await rm(publishDir, { force: true, recursive: true });
await mkdir(publishDir, { recursive: true });

try {
  for (const pkg of publishablePackages) {
    const spec = `${pkg.name}@${pkg.version}`;
    if (plan.get(spec) === "published") {
      skipped.push(spec);
      console.log(`${spec} already exists on npm; skipping.`);
      continue;
    }

    if (dryRun) {
      console.log(`[dry-run] would publish ${spec} with tag "${releaseTag}".`);
      continue;
    }

    const tarball = await packPackage(pkg);
    await publishPackage(tarball);
    published.push(spec);
  }

  if (published.length > 0) {
    console.log(`Published ${published.length} package(s): ${published.join(", ")}`);
  } else {
    console.log("No unpublished packages found.");
  }

  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} already-published package(s).`);
  }
} catch (error) {
  // The pre-flight removes the predictable failures, not network or auth ones.
  // npm has no rollback, so name what did go out — otherwise the operator has
  // to reconstruct a partly-released state from the registry by hand.
  if (published.length > 0) {
    console.error(
      `Release stopped after publishing ${published.length} package(s): ${published.join(", ")}. ` +
        `The remaining packages were not published. Re-run once the cause is fixed; the ` +
        `packages above are skipped as already published.`,
    );
  }

  throw error;
} finally {
  // The staging directory is scratch space for this run. Leaving it behind
  // makes the publish dry-run smoke refuse to start, and its tarballs match
  // the *.tgz ignore rule, so it stays invisible to git status while it does.
  await rm(publishDir, { force: true, recursive: true });
}

function normalizeRegistry(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

async function readPrereleaseTag() {
  const prePath = join(rootDir, ".changeset", "pre.json");
  if (!existsSync(prePath)) {
    return undefined;
  }

  const pre = JSON.parse(await readFile(prePath, "utf8"));
  return typeof pre.tag === "string" && pre.tag.length > 0 ? pre.tag : undefined;
}

async function readWorkspacePackages() {
  const entries = await readdir(packagesDir, { withFileTypes: true });
  const workspacePackages = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const dir = join(packagesDir, entry.name);
    const packageJsonPath = join(dir, "package.json");
    if (!existsSync(packageJsonPath)) {
      continue;
    }

    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
    if (packageJson.private === true) {
      continue;
    }

    workspacePackages.push({
      dir,
      localDependencyNames: getDependencyNames(packageJson),
      name: packageJson.name,
      version: packageJson.version,
    });
  }

  return workspacePackages;
}

function getDependencyNames(packageJson) {
  const names = new Set();
  for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
    const dependencies = packageJson[field];
    if (!dependencies) {
      continue;
    }

    for (const name of Object.keys(dependencies)) {
      names.add(name);
    }
  }

  return names;
}

function sortPackages(workspacePackages) {
  const byName = new Map(workspacePackages.map((pkg) => [pkg.name, pkg]));
  const visiting = new Set();
  const visited = new Set();
  const sorted = [];

  const visit = (pkg) => {
    if (visited.has(pkg.name)) {
      return;
    }

    if (visiting.has(pkg.name)) {
      throw new Error(`Circular local package dependency detected at ${pkg.name}.`);
    }

    visiting.add(pkg.name);
    for (const dependencyName of pkg.localDependencyNames) {
      const dependency = byName.get(dependencyName);
      if (dependency) {
        visit(dependency);
      }
    }

    visiting.delete(pkg.name);
    visited.add(pkg.name);
    sorted.push(pkg);
  };

  for (const pkg of workspacePackages) {
    visit(pkg);
  }

  return sorted;
}

/**
 * Classifies every package as `new`, `published`, or `burned` before anything
 * is sent, and refuses the release if any is `burned`.
 *
 * A version npm has ever held is recorded in the packument's `time` map for
 * good, while `versions` lists only what is still installable. A version in
 * `time` but not in `versions` was unpublished, and npm rejects republishing it
 * — permanently. Publishing into that is the one failure that cannot be
 * retried, so it must not be discovered mid-loop.
 */
async function planRelease(packages) {
  const classified = new Map();
  const burned = [];

  for (const pkg of packages) {
    const spec = `${pkg.name}@${pkg.version}`;
    const registryVersions = await readRegistryVersions(pkg.name);

    if (registryVersions.available.has(pkg.version)) {
      classified.set(spec, "published");
      continue;
    }

    if (registryVersions.everPublished.has(pkg.version)) {
      classified.set(spec, "burned");
      burned.push(spec);
      continue;
    }

    classified.set(spec, "new");
  }

  if (burned.length > 0) {
    throw new Error(
      `${burned.length} version(s) were published and then unpublished, and npm will not accept ` +
        `them again: ${burned.join(", ")}. Nothing was published. Bump each to a version npm has ` +
        `never held — and keep every package on that same version, which ` +
        `\`pnpm run test:docs-versions\` checks.`,
    );
  }

  return classified;
}

async function readRegistryVersions(name) {
  const result = await run("npm", ["view", name, "time", "--json", "--registry", registry], {
    capture: true,
    allowFailure: true,
  });

  if (result.code !== 0) {
    const output = `${result.stdout}\n${result.stderr}`;

    if (/E404|404 Not Found|No match found|not found/i.test(output)) {
      return { available: new Set(), everPublished: new Set() };
    }

    throw new Error(`Failed to check ${name} on npm:\n${output.trim()}`);
  }

  const time = JSON.parse(result.stdout.trim() || "{}");
  // `created` and `modified` are packument metadata, not releases.
  const everPublished = new Set(
    Object.keys(time).filter((key) => key !== "created" && key !== "modified"),
  );
  const versions = await run("npm", ["view", name, "versions", "--json", "--registry", registry], {
    capture: true,
    allowFailure: true,
  });
  const parsed = versions.code === 0 ? JSON.parse(versions.stdout.trim() || "[]") : [];

  return {
    // A package with exactly one version prints it as a bare string, not an array.
    available: new Set(Array.isArray(parsed) ? parsed : [parsed]),
    everPublished,
  };
}

async function packPackage(pkg) {
  const destination = join(publishDir, pkg.name.replaceAll("@", "").replaceAll("/", "__"));
  await rm(destination, { force: true, recursive: true });
  await mkdir(destination, { recursive: true });

  await run("pnpm", ["pack", "--pack-destination", destination], { cwd: pkg.dir });

  const tarballs = (await readdir(destination)).filter((file) => file.endsWith(".tgz"));

  if (tarballs.length !== 1) {
    throw new Error(`Expected one tarball for ${pkg.name}, found ${tarballs.length}.`);
  }

  return join(destination, tarballs[0]);
}

async function publishPackage(tarball) {
  await run("npm", [
    "publish",
    tarball,
    "--access",
    "public",
    "--tag",
    releaseTag,
    "--registry",
    registry,
  ]);
}

async function run(command, args, options = {}) {
  const cwd = options.cwd ?? rootDir;
  const capture = options.capture === true;
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  let stdout = "";
  let stderr = "";

  if (capture) {
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
  }

  const code = await new Promise((done, reject) => {
    child.on("error", reject);
    child.on("close", done);
  });

  if (code !== 0 && options.allowFailure !== true) {
    const output = capture ? `\n${stdout}${stderr}` : "";
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${code}.${output}`);
  }

  return { code, stdout, stderr };
}
