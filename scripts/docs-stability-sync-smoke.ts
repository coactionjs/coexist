#!/usr/bin/env node
// The worker runtime's Stable label is a promise, so it is checked like one.
// The maturity table, README badge, worker guide, and package README must all
// say Stable. `@coexist/create` stays Beta on purpose: a future blanket
// find-and-replace must not promote an unrelated surface. The anchors of the
// renamed headings, old and new, are checked by `docs-anchors-smoke.ts`.
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { rootDir } from "./lib/smoke.ts";

const paths = await listPublicDocuments();
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

expectContains("README.md", "Web_Worker-stable");
expectContains("README.md", "## Worker & Shared Runtime");
expectContains("docs/scope-and-stability.md", "## The worker runtime");
expectContains("docs/worker-runtime.md", "The worker API is **Stable**");
expectContains("docs/worker-runtime.md", "## Operating checklist");
expectContains("packages/core/README.md", "The worker API is **Stable**");

// Each area needs exactly one row with its label. Checking only that a Stable
// row existed let a second, contradicting row through, and any other row about
// the worker or shared tabs must not label that surface differently either.
const maturityRows = readMaturityRows(read("docs/scope-and-stability.md"));

const expectMaturity = (area: string, status: string): void => {
  const statuses = maturityRows.filter((row) => row.area === area).map((row) => row.status);

  if (statuses.length !== 1 || statuses[0] !== status) {
    problems.push(
      `docs/scope-and-stability.md must have exactly one ${JSON.stringify(area)} row, ` +
        `labelled ${status}; found ${statuses.length === 0 ? "none" : statuses.join(", ")}.`,
    );
  }
};

expectMaturity("Worker runtime", "Stable");
expectMaturity("Shared-tab coordination", "Stable");
expectMaturity("`@coexist/create`", "Beta");

for (const { area, status } of maturityRows) {
  if (/worker|shared[- ]tab|broadcast/i.test(area) && status !== "Stable") {
    problems.push(
      `docs/scope-and-stability.md labels ${JSON.stringify(area)} ${status}, ` +
        "but the worker runtime and shared-tab coordination are Stable.",
    );
  }
}

// A stale claim is a sentence that still gives the worker runtime a pre-Stable
// label. A list of fixed phrases missed rewordings such as "remains beta" or
// "is [beta](…)" and also rejected true statements about `@coexist/create`, so
// sentences are matched instead: one that carries a maturity label and names
// the runtime, or that sits in the worker guide, is stale unless it is about
// `@coexist/create`. "Prototype" counts only as a label ("a prototype"), not
// as the JavaScript object prototype.
const maturityLabel = /(?<!\bnot (?:a |an )?)\b(?:beta|experimental|(?:a|worker)\s+prototype)\b/i;
const workerContext = /\bworker|\bruntime\b|\bshared[- ]tabs?\b|\bbroadcastchannel\b|\btransport/i;
const createSurface = /@coexist\/create/i;
const workerGuides = new Set(["docs/worker-runtime.md"]);

for (const [path, source] of Object.entries(sources)) {
  for (const sentence of readSentences(source)) {
    if (!maturityLabel.test(sentence) || createSurface.test(sentence)) {
      continue;
    }

    if (workerGuides.has(path) || workerContext.test(sentence)) {
      problems.push(
        `${path} still labels the worker runtime pre-Stable: ${JSON.stringify(sentence)}.`,
      );
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

/** The root README, every guide, and every package and example README. */
async function listPublicDocuments(): Promise<string[]> {
  const guides = (await readdir(join(rootDir, "docs")))
    .filter((name) => name.endsWith(".md"))
    .map((name) => `docs/${name}`);
  const readmes = await Promise.all(
    ["packages", "examples"].map(async (directory) => {
      const entries = await readdir(join(rootDir, directory), { withFileTypes: true });
      const candidates = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${directory}/${entry.name}/README.md`);
      const present = await Promise.all(
        candidates.map(async (path) => ((await isFile(path)) ? path : undefined)),
      );

      return present.filter((path) => path !== undefined);
    }),
  );

  return ["README.md", ...guides.toSorted(), ...readmes.flat().toSorted()];
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(join(rootDir, path))).isFile();
  } catch {
    return false;
  }
}

/** The rows of the "Maturity by area" table, as area cell and unbolded status. */
function readMaturityRows(markdown: string): { readonly area: string; readonly status: string }[] {
  const table = /^## Maturity by area\n([\s\S]*?)(?=^## )/m.exec(markdown)?.[1] ?? "";

  return table
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) => line.split("|").map((cell) => cell.trim()))
    .map(([, area = "", status = ""]) => ({
      area,
      status: /^\*\*(.+)\*\*$/.exec(status)?.[1] ?? status,
    }))
    .filter(({ area }) => area !== "Area" && !/^-+$/.test(area));
}

/**
 * The prose of a Markdown document as sentences, without code blocks, HTML such
 * as the legacy anchors, or link targets, which may still name those anchors.
 */
function readSentences(markdown: string): string[] {
  return markdown
    .replaceAll(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "")
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll(/\]\([^)]*\)/g, "]")
    .split(/\n+|(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}
