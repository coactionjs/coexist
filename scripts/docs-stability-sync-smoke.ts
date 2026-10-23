#!/usr/bin/env node
// The worker runtime's Stable label is a promise, so it is checked like one.
// The maturity table, README badge, worker guide, and package README must all
// say Stable, and the anchors the published 2.0.0 README links to must keep
// working. `@coexist/create` stays Beta on purpose: a future blanket
// find-and-replace must not promote an unrelated surface.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { rootDir } from "./lib/smoke.ts";

const paths = [
  "README.md",
  "docs/scope-and-stability.md",
  "docs/worker-runtime.md",
  "docs/introduction.md",
  "docs/ui-adapters.md",
  "docs/faq.md",
  "packages/core/README.md",
];
const sources: Record<string, string> = Object.fromEntries(
  await Promise.all(
    paths.map(async (path) => [path, await readFile(join(rootDir, path), "utf8")] as const),
  ),
);

const problems: string[] = [];

const read = (path: string): string => sources[path] ?? "";

const expectContains = (path: string, fragment: string): void => {
  if (!read(path).includes(fragment)) {
    problems.push(`${path} must contain ${JSON.stringify(fragment)}.`);
  }
};

const expectMatches = (path: string, pattern: RegExp, description: string): void => {
  if (!pattern.test(read(path))) {
    problems.push(`${path} must contain ${description}.`);
  }
};

expectContains("README.md", "Web_Worker-stable");
expectContains("README.md", "## Worker & Shared Runtime");
expectContains("docs/scope-and-stability.md", "## The worker runtime");
expectContains("docs/worker-runtime.md", "The worker API is **Stable**");
expectContains("docs/worker-runtime.md", "## Operating checklist");
expectContains("packages/core/README.md", "The worker API is **Stable**");
expectContains("docs/scope-and-stability.md", 'id="the-worker-runtime-is-beta"');
expectContains("docs/worker-runtime.md", 'id="what-the-beta-covers-and-doesnt"');

expectMatches(
  "docs/scope-and-stability.md",
  /^\|\s*Worker runtime\s*\|\s*\*\*Stable\*\*/m,
  "a Stable Worker runtime row",
);
expectMatches(
  "docs/scope-and-stability.md",
  /^\|\s*Shared-tab coordination\s*\|\s*\*\*Stable\*\*/m,
  "a Stable Shared-tab coordination row",
);
expectMatches(
  "docs/scope-and-stability.md",
  /^\|\s*`@coexist\/create`\s*\|\s*\*\*Beta\*\*/m,
  "an explicit Beta row for @coexist/create",
);

const staleClaims = [
  "beta worker runtime",
  "worker runtime is beta",
  "the beta covers",
  "this is beta",
  "the beta intentionally",
  "until the runtime leaves beta",
  "worker prototype",
  "worker / shared runtime",
];

for (const [path, source] of Object.entries(sources)) {
  const lower = source.toLowerCase();

  for (const claim of staleClaims) {
    if (lower.includes(claim)) {
      problems.push(`${path} still contains the stale claim ${JSON.stringify(claim)}.`);
    }
  }
}

if (read("README.md").includes("Web_Worker-beta")) {
  problems.push("README.md still advertises the Web Worker badge as beta.");
}

if (problems.length > 0) {
  throw new Error(`Worker stability claims are out of sync:\n\n${problems.join("\n")}`);
}

console.log(`Verified worker stability claims across ${paths.length} public documents.`);
