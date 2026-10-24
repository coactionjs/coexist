#!/usr/bin/env node
// Every relative Markdown link that names a heading must land on one. A renamed
// heading breaks its links silently: GitHub opens the page at the top and
// nothing fails. Two kinds of anchor have no link in the repository to protect
// them, so they are pinned here instead: anchors that already-published npm
// READMEs link to, which resolve against the default branch and can no longer
// be edited, and the legacy anchors kept for links from outside the repository.
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, normalize, relative } from "node:path";

import { rootDir } from "./lib/smoke.ts";

const pinnedAnchors = [
  // Linked from package READMEs published to npm.
  "docs/state-and-reactivity.md#invalidation-granularity",
  "docs/worker-runtime.md#the-option-surface",
  "packages/core/README.md#worker--shared-runtime",
  // Headings renamed when the worker runtime became Stable.
  "README.md#worker-prototype",
  "docs/scope-and-stability.md#the-worker-runtime-is-beta",
  "docs/worker-runtime.md#what-the-beta-covers-and-doesnt",
];
// Changelogs record links as they were when an entry was written.
const skippedFiles = new Set(["CHANGELOG.md"]);
const skippedDirectories = new Set([".git", ".turbo", "coverage", "dist", "node_modules"]);

const paths = await listMarkdown(rootDir);
const sources = new Map(
  await Promise.all(
    paths.map(async (path) => [path, await readFile(join(rootDir, path), "utf8")] as const),
  ),
);
const anchorsByPath = new Map([...sources].map(([path, source]) => [path, readAnchors(source)]));
const problems: string[] = [];
let checked = 0;

for (const [path, source] of sources) {
  for (const { line, target } of readLinks(source)) {
    const hashIndex = target.indexOf("#");

    if (hashIndex === -1 || /^[a-z][a-z\d+.-]*:/i.test(target)) {
      continue;
    }

    const file = target.slice(0, hashIndex);
    const resolved = file === "" ? path : normalize(join(dirname(path), file));

    if (!resolved.endsWith(".md")) {
      continue;
    }

    checked += 1;
    const problem = checkAnchor(resolved, target.slice(hashIndex + 1));

    if (problem !== undefined) {
      problems.push(`${path}:${line} links to ${target}, but ${problem}.`);
    }
  }
}

for (const pinned of pinnedAnchors) {
  const [file = "", anchor = ""] = pinned.split("#");
  const problem = checkAnchor(file, anchor);

  if (problem !== undefined) {
    problems.push(`The pinned anchor ${pinned} no longer resolves: ${problem}.`);
  }
}

if (problems.length > 0) {
  throw new Error(`Markdown links point at missing anchors:\n\n${problems.join("\n")}`);
}

console.log(
  `Verified ${checked} anchor link(s) and ${pinnedAnchors.length} pinned anchor(s) ` +
    `across ${paths.length} Markdown files.`,
);

function checkAnchor(path: string, anchor: string): string | undefined {
  const anchors = anchorsByPath.get(path);

  if (anchors === undefined) {
    return `${path} does not exist`;
  }

  return anchors.has(decodeURIComponent(anchor)) ? undefined : `${path} has no #${anchor}`;
}

async function listMarkdown(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        return skippedDirectories.has(entry.name) ? [] : listMarkdown(path);
      }

      return entry.isFile() && entry.name.endsWith(".md") && !skippedFiles.has(entry.name)
        ? [relative(rootDir, path)]
        : [];
    }),
  );

  return nested.flat().toSorted();
}

/** Prose lines with their line numbers, skipping fenced code. */
function readProseLines(source: string): { readonly line: number; readonly text: string }[] {
  const lines: { line: number; text: string }[] = [];
  let fence: string | undefined;

  for (const [index, text] of source.split("\n").entries()) {
    const marker = /^\s*(```|~~~)/.exec(text)?.[1];

    if (marker !== undefined && (fence === undefined || fence === marker)) {
      fence = fence === undefined ? marker : undefined;
      continue;
    }

    if (fence === undefined) {
      lines.push({ line: index + 1, text });
    }
  }

  return lines;
}

/**
 * The anchors GitHub generates for a document's headings, numbered on repeats
 * the way it does, plus explicit `<a id>` and `<a name>` anchors.
 */
function readAnchors(source: string): Set<string> {
  const anchors = new Set<string>();
  const repeats = new Map<string, number>();

  for (const { text } of readProseLines(source)) {
    const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(text)?.[1];

    if (heading !== undefined) {
      const slug = slugifyHeading(heading);
      const seen = repeats.get(slug) ?? 0;

      repeats.set(slug, seen + 1);
      anchors.add(seen === 0 ? slug : `${slug}-${seen}`);
    }

    for (const match of text.matchAll(/<a\s[^>]*\b(?:id|name)="([^"]+)"/g)) {
      anchors.add(match[1] ?? "");
    }
  }

  return anchors;
}

/** GitHub's heading slug: the rendered text, lowercased, punctuation dropped, spaces hyphenated. */
function slugifyHeading(heading: string): string {
  return heading
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replaceAll("`", "")
    .trim()
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replaceAll(" ", "-");
}

function readLinks(source: string): { readonly line: number; readonly target: string }[] {
  return readProseLines(source).flatMap(({ line, text }) =>
    [...text.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map((match) => ({
      line,
      target: match[1] ?? "",
    })),
  );
}
