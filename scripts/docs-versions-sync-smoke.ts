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
let comparedRanges = 0;
let comparedEngines = 0;

for (const dir of dirs) {
  const manifestPath = join(packagesDir, dir, "package.json");
  const manifest = await readManifest(manifestPath);

  if (manifest === undefined || manifest.private === true) {
    continue;
  }

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
  `Verified ${comparedRanges} documented peer range(s) and ${comparedEngines} engines field(s) ` +
    `against the manifests.`,
);
