import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  deps: {
    neverBundle: ["@coexist/core", "svelte"],
  },
  dts: true,
  entry: ["src/index.ts", "src/runes.ts"],
  format: ["esm"],
  platform: "browser",
  sourcemap: true,
  target: "es2022",
  treeshake: true,
});
