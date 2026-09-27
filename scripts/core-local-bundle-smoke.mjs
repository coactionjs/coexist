#!/usr/bin/env node
import { gzipSync } from "node:zlib";

import { build } from "esbuild";

const results = new Map(await Promise.all(["index", "local"].map(measureEntry)));

async function measureEntry(entry) {
  const result = await build({
    stdin: {
      contents: `import { createApp, defineModule } from "./packages/core/dist/${entry}.js"; console.log(createApp, defineModule);`,
      resolveDir: process.cwd(),
      sourcefile: `coexist-${entry}-consumer.js`,
    },
    bundle: true,
    format: "esm",
    metafile: true,
    minify: true,
    platform: "browser",
    write: false,
  });

  const output = result.outputFiles[0];
  const outputMetadata = Object.values(result.metafile.outputs)[0];
  const dependencyBytes = Object.entries(outputMetadata.inputs)
    .filter(([path]) => path.includes("data-transport") || path.includes("coaction/dist/shared"))
    .reduce((sum, [, input]) => sum + input.bytesInOutput, 0);

  return [entry, { dependencyBytes, gzip: gzipSync(output.contents).length }];
}

const shared = results.get("index");
const local = results.get("local");

if (shared.dependencyBytes === 0) {
  throw new Error("The default entry must retain the shared Coaction store runtime.");
}

if (local.dependencyBytes !== 0) {
  throw new Error("The local entry bundled Coaction shared-store or data-transport code.");
}

if (local.gzip > shared.gzip * 0.85) {
  throw new Error(
    `The local entry is no longer meaningfully smaller: ${local.gzip} vs ${shared.gzip} gzip bytes.`,
  );
}

console.log(
  `Core consumer bundle: default ${shared.gzip} B gzip, local ${local.gzip} B gzip ` +
    `(${Math.round((1 - local.gzip / shared.gzip) * 100)}% smaller); local shared dependency bytes: 0.`,
);
