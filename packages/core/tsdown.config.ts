import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts", "src/local.ts"],
  format: ["esm"],
  platform: "neutral",
  sourcemap: true,
  target: "es2022",
  treeshake: true,
});
