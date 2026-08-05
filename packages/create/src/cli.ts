#!/usr/bin/env node
import { resolve } from "node:path";

import { createCoexistProject } from "./index.js";

const args = process.argv.slice(2);
const force = args.includes("--force");
const target = args.find((arg) => !arg.startsWith("-")) ?? "coexist-app";
const root = resolve(process.cwd(), target);

try {
  await createCoexistProject({
    force,
    name: target,
    root,
  });
  console.log(`Created Coexist project at ${root}`);
} catch (error) {
  // A scaffold failure is a user-facing message, not a stack trace: the caller
  // needs to know which directory or name to change.
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
