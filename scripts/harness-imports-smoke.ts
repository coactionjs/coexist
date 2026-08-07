#!/usr/bin/env node
// 45 smoke scripts import the shared harness in `scripts/lib/smoke.ts`, and
// most of them cost minutes to run because they install real tarballs. Only the
// harness itself is typechecked (see scripts/tsconfig.json), and oxlint's
// `no-undef` cannot see across a module boundary, so renaming or removing a
// harness export currently breaks its importers silently — each one fails only
// when it eventually runs, in whichever CI job happens to reach it first.
//
// This check closes that specific gap: it costs milliseconds and fails with the
// list of scripts a harness change would have broken.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const scriptsDir = new URL(".", import.meta.url).pathname;
const harnessPath = join(scriptsDir, "lib/smoke.ts");
const harnessSource = await readFile(harnessPath, "utf8");
const exported = new Set(
  [...harnessSource.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/gm)].map(
    (match) => match[1],
  ),
);
const exportedTypes = new Set(
  [...harnessSource.matchAll(/^export\s+(?:interface|type)\s+(\w+)/gm)].map((match) => match[1]),
);

if (exported.size === 0) {
  throw new Error("scripts/lib/smoke.ts exports nothing; the parser is out of date.");
}

const entries = (await readdir(scriptsDir)).filter((entry) => entry.endsWith(".ts"));
const sources = await Promise.all(
  entries.map(async (entry) => [entry, await readFile(join(scriptsDir, entry), "utf8")] as const),
);
const problems = [];
let checked = 0;

for (const [entry, source] of sources) {
  const importMatch = /import\s*\{([^}]*)\}\s*from\s*"\.\/lib\/smoke\.ts"/s.exec(source);

  if (importMatch === null) {
    continue;
  }

  checked += 1;

  for (const specifier of importMatch[1].split(",")) {
    const name = specifier
      .trim()
      .replace(/^type\s+/, "")
      .split(/\s+as\s+/)[0];

    if (name === "" || exported.has(name) || exportedTypes.has(name)) {
      continue;
    }

    problems.push(`${entry} imports ${name}, which scripts/lib/smoke.ts does not export.`);
  }
}

if (problems.length > 0) {
  throw new Error(
    `The smoke harness and its importers are out of sync.\n\n${problems.join("\n")}\n\n` +
      `scripts/lib/smoke.ts exports: ${[...exported].toSorted().join(", ")}.`,
  );
}

console.log(`Verified ${checked} smoke script(s) against the harness in scripts/lib/smoke.ts.`);
