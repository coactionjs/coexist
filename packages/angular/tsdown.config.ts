import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  deps: {
    neverBundle: ["@angular/core", "@coexist/core"],
  },
  dts: true,
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "browser",
  sourcemap: true,
  target: "es2022",
  treeshake: true,
});
