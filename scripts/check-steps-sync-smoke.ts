#!/usr/bin/env node
// The repository verifies itself through two hand-maintained lists: the root
// `check` script and the CI workflow. They must stay in sync — a step added to
// one but not the other either never runs in CI or never runs locally.
//
// CI spreads those steps across staged jobs, so this compares the set of
// scripts rather than their order or grouping. Which job runs a step is a
// scheduling decision; whether it runs at all is not.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { rootDir } from "./lib/smoke.ts";

const packageJsonPath = join(rootDir, "package.json");
const workflowPath = join(rootDir, ".github/workflows/ci.yml");

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const checkScript = packageJson.scripts?.check;

if (typeof checkScript !== "string") {
  throw new Error("Root package.json has no check script.");
}

const checkSteps = checkScript
  .split("&&")
  .map((step) => step.trim())
  .map((step) => step.replace(/^pnpm run /, ""));

const workflow = await readFile(workflowPath, "utf8");
const workflowSteps = [...workflow.matchAll(/^\s*run: pnpm run ([\w:-]+)\s*$/gm)].map(
  (match) => match[1],
);

const missingFromWorkflow = checkSteps.filter((step) => !workflowSteps.includes(step));
const missingFromCheck = workflowSteps.filter((step) => !checkSteps.includes(step));
const problems = [];

if (checkSteps.length === 0) {
  problems.push("The check script lists no steps.");
}

if (workflowSteps.length === 0) {
  problems.push("The CI workflow runs no pnpm scripts.");
}

if (missingFromWorkflow.length > 0) {
  problems.push(
    `Steps in the check script but not in CI: ${missingFromWorkflow.join(", ")}.\n` +
      "Add them to .github/workflows/ci.yml so CI verifies them too.",
  );
}

if (missingFromCheck.length > 0) {
  problems.push(
    `Steps in CI but not in the check script: ${missingFromCheck.join(", ")}.\n` +
      "Add them to the root check script so contributors run them locally.",
  );
}

if (problems.length > 0) {
  throw new Error(`check and CI step lists are out of sync.\n\n${problems.join("\n\n")}`);
}

console.log(`Verified ${checkSteps.length} check step(s) against the CI workflow.`);
