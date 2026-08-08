#!/usr/bin/env node
// The stability doc opens by saying it "is updated with the code, not
// aspirationally". Two of its claims are hand-copied numbers that nothing
// checked: the adapter peer-range table, and the Node floor it says matches the
// `engines` field. Both are compatibility promises, so a stale one is a wrong
// promise rather than a stale sentence.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { packagesDir, rootDir } from "./lib/smoke.ts";

const docPath = join(rootDir, "docs/scope-and-stability.md");
const doc = await readFile(docPath, "utf8");
const rootManifest = JSON.parse(await readFile(join(rootDir, "package.json"), "utf8"));
const nodeFloor = rootManifest.engines?.node;
const problems = [];

if (typeof nodeFloor !== "string") {
  throw new Error("The root package.json declares no engines.node.");
}

// | `@coexist/react` | `^18.3.0 \|\| ^19.0.0` | React 19 |
const documentedRanges = new Map(
  [...doc.matchAll(/^\|\s*`(@coexist\/[\w-]+)`\s*\|\s*`([^`]+)`\s*\|/gm)].map((match) => [
    match[1],
    match[2].replaceAll("\\|", "|"),
  ]),
);

const dirs = await readdir(packagesDir);
const releaseVersions = new Map();
let comparedRanges = 0;
let comparedEngines = 0;

for (const dir of dirs) {
  const manifestPath = join(packagesDir, dir, "package.json");
  const manifest = await readManifest(manifestPath);

  if (manifest === undefined || manifest.private === true) {
    continue;
  }

  releaseVersions.set(manifest.name, manifest.version);

  const frameworkPeers = Object.entries(manifest.peerDependencies ?? {}).filter(
    ([name]) => !name.startsWith("@coexist/"),
  );

  if (manifest.engines?.node !== nodeFloor) {
    problems.push(
      `${manifest.name} declares engines.node ${JSON.stringify(manifest.engines?.node)}, ` +
        `but the documented floor is ${JSON.stringify(nodeFloor)}. A published package that ` +
        `omits it gives a consumer on an older Node no warning at all.`,
    );
  } else {
    comparedEngines += 1;
  }

  if (frameworkPeers.length === 0) {
    continue;
  }

  const documented = documentedRanges.get(manifest.name);

  if (documented === undefined) {
    problems.push(
      `${manifest.name} declares a framework peer range but the table in ` +
        `docs/scope-and-stability.md has no row for it.`,
    );
    continue;
  }

  for (const [peer, range] of frameworkPeers) {
    if (documented === range) {
      comparedRanges += 1;
      continue;
    }

    problems.push(
      `${manifest.name} declares ${peer} ${JSON.stringify(range)}, but ` +
        `docs/scope-and-stability.md says ${JSON.stringify(documented)}.`,
    );
  }
}

if (!doc.includes(`\`${nodeFloor}\``)) {
  problems.push(
    `docs/scope-and-stability.md never states the Node floor ${JSON.stringify(nodeFloor)}.`,
  );
}

// "All `@coexist/*` packages are released together at the same version" was
// prose that nothing checked, and it broke twice: once when a peer-dependency
// changeset carried nine packages to 1.0.0 while core stayed at 0.3.0, and
// again when a hand-written lockstep bump missed `@coexist/devtools`. Both
// times the publish script's skip-if-published branch would have reported
// success while leaving a package behind on an incompatible peer range, which
// is the failure this assertion exists to make loud.
const distinctVersions = new Set(releaseVersions.values());

if (distinctVersions.size > 1) {
  const grouped = [...distinctVersions].toSorted().map((version) => {
    const names = [...releaseVersions]
      .filter(([, value]) => value === version)
      .map(([name]) => name)
      .toSorted();

    return `${version} (${names.join(", ")})`;
  });

  problems.push(
    `Published packages must share one version, but ${distinctVersions.size} are in use: ` +
      `${grouped.join("; ")}.`,
  );
}

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(problem);
  }

  throw new Error(
    `docs/scope-and-stability.md disagrees with the manifests in ${problems.length} place(s).`,
  );
}

async function readManifest(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}

console.log(
  `Verified ${comparedRanges} documented peer range(s), ${comparedEngines} engines field(s), and ` +
    `${releaseVersions.size} package(s) sharing version ${[...distinctVersions][0]}.`,
);
