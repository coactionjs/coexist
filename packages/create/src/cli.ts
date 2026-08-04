#!/usr/bin/env node
import { resolve } from "node:path";

import { createCoexistProject } from "./index.js";

const target = process.argv[2] ?? "cosystem-app";
const root = resolve(process.cwd(), target);

await createCoexistProject({
  name: target,
  root,
});

console.log(`Created Coexist project at ${root}`);
