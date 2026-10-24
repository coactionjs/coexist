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

// The slug rules are this script's own reading of GitHub's, so they are pinned:
// the first three are anchors that published READMEs link to and that GitHub
// is known to generate; the rest fix how rendering treats markup.
const knownSlugs = [
  ["Worker & shared runtime", "worker--shared-runtime"],
  ["What the runtime covers (and doesn't)", "what-the-runtime-covers-and-doesnt"],
  ["The `WorkerClient` API", "the-workerclient-api"],
  ["_Emphasis_ and **strong**", "emphasis-and-strong"],
  ["`snake_case` and snake_case", "snake_case-and-snake_case"],
  ["Fish &amp; chips", "fish--chips"],
  ["`&amp;` in code", "amp-in-code"],
] as const;

for (const [heading, expected] of knownSlugs) {
  const actual = slugifyHeading(heading);

  if (actual !== expected) {
    throw new Error(
      `The anchor for ${JSON.stringify(heading)} must be ${expected}, not ${actual}: ` +
        "the slug rules drifted from GitHub's.",
    );
  }
}

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

/** Prose lines with their line numbers, skipping front matter and fenced code. */
function readProseLines(source: string): { readonly line: number; readonly text: string }[] {
  const lines: { line: number; text: string }[] = [];
  const sourceLines = source.split("\n");
  const frontMatterEnd = sourceLines[0] === "---" ? sourceLines.indexOf("---", 1) : -1;
  let fence: string | undefined;

  for (const [index, text] of sourceLines.entries()) {
    if (index <= frontMatterEnd) {
      continue;
    }

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
  let previous = "";

  for (const { text } of readProseLines(source)) {
    // An ATX heading (`## Title`), or a setext one: a paragraph line underlined
    // with `===` or `---`. A `---` after a blank line, a list, or a table is a
    // rule or a delimiter instead.
    const heading =
      /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(text)?.[1] ??
      (/^ {0,3}(?:=+|-+)\s*$/.test(text) &&
      /^ {0,3}[^\s#>|*+-]/.test(previous) &&
      !/^ {0,3}\d+[.)]\s/.test(previous)
        ? previous.trim()
        : undefined);

    previous = text;

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

/**
 * GitHub's heading slug: the rendered text, lowercased, with punctuation
 * dropped and spaces hyphenated. Rendering keeps a code span's text verbatim,
 * removes the underscores that delimit emphasis while keeping those inside a
 * word, and decodes HTML entities.
 */
function slugifyHeading(heading: string): string {
  const text = heading
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .split(/(`[^`]*`)/)
    .map((part) =>
      part.startsWith("`") && part.endsWith("`") && part.length > 1
        ? part.slice(1, -1)
        : decodeEntities(part.replaceAll(/(?<![\p{L}\p{N}])_+|_+(?![\p{L}\p{N}])/gu, "")),
    )
    .join("");

  return text
    .trim()
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replaceAll(" ", "-");
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return text.replaceAll(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity: string, name: string) => {
    if (name.startsWith("#")) {
      const code =
        name[1]?.toLowerCase() === "x" ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));

      return Number.isInteger(code) && code > 0 ? String.fromCodePoint(code) : entity;
    }

    return named[name.toLowerCase()] ?? entity;
  });
}

function readLinks(source: string): { readonly line: number; readonly target: string }[] {
  return readProseLines(source).flatMap(({ line, text }) =>
    [...text.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map((match) => ({
      line,
      target: match[1] ?? "",
    })),
  );
}
