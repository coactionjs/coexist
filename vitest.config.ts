import ts from "typescript";
import { defineConfig, type Plugin } from "vitest/config";

// The Oxc transform pipeline passes standard decorator syntax through
// untransformed, which Node cannot parse yet. Fixture files exercising
// decorators are lowered with the TypeScript compiler instead — the same
// output real consumers run.
const standardDecoratorFixtures: Plugin = {
  enforce: "pre",
  name: "coexist:standard-decorator-fixtures",
  transform(code: string, id: string) {
    if (!id.endsWith(".fixture.ts")) {
      return null;
    }

    const result = ts.transpileModule(code, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        sourceMap: true,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: id,
    });

    return {
      code: result.outputText,
      map: result.sourceMapText === undefined ? null : JSON.parse(result.sourceMapText),
    };
  },
};

export default defineConfig({
  plugins: [standardDecoratorFixtures],
  test: {
    coverage: {
      exclude: ["**/*.config.*", "**/*.d.ts", "**/coverage/**", "**/dist/**", "**/node_modules/**"],
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage",
      // Floors, not targets. They sit below today's numbers so an unrelated
      // change is not blocked by a rounding difference, but close enough that
      // deleting a test suite fails the build instead of passing quietly.
      thresholds: {
        branches: 83,
        functions: 92,
        lines: 89,
        statements: 89,
        // The runtime everything else depends on is held to a higher bar.
        "packages/core/src/**": {
          branches: 83,
          functions: 93,
          lines: 89,
          statements: 89,
        },
        // The collaborators split out of RuntimeApp are small, self-contained,
        // and directly unit-tested; there is no reason for them to drift back.
        "packages/core/src/{effectRuntime,moduleRegistry,mutationScheduler,lifecycleController}.ts":
          {
            branches: 84,
            functions: 87,
            lines: 93,
            statements: 93,
          },
        // Aggregate floors let one weak adapter hide behind the rest, so the
        // Svelte package carries its own. The rune subscription callbacks only
        // run inside a Svelte effect, which a plain .ts test cannot open.
        "packages/svelte/src/**": {
          branches: 85,
          functions: 85,
          lines: 85,
          statements: 85,
        },
      },
    },
    environment: "node",
    globals: false,
    // A project whose tests all disappeared must fail rather than report
    // success for running nothing.
    passWithNoTests: false,
    projects: [
      {
        extends: true,
        test: {
          include: ["src/**/*.test.ts"],
          name: "@coexist/angular",
          root: "./packages/angular",
        },
      },
      {
        extends: true,
        test: {
          include: ["src/**/*.test.ts"],
          name: "@coexist/core",
          root: "./packages/core",
        },
      },
      {
        extends: true,
        test: {
          include: ["src/**/*.test.ts"],
          name: "@coexist/create",
          root: "./packages/create",
        },
      },
      {
        extends: true,
        test: {
          include: ["src/**/*.test.ts"],
          name: "@coexist/devtools",
          root: "./packages/devtools",
        },
      },
      {
        extends: true,
        test: {
          include: ["src/**/*.test.ts"],
          name: "@coexist/integration",
          root: "./packages/integration",
        },
      },
      {
        extends: true,
        test: {
          include: ["src/**/*.test.ts"],
          name: "@coexist/react",
          root: "./packages/react",
        },
      },
      {
        extends: true,
        test: {
          include: ["src/**/*.test.ts"],
          name: "@coexist/router",
          root: "./packages/router",
        },
      },
      {
        extends: true,
        test: {
          include: ["src/**/*.test.ts"],
          name: "@coexist/solid",
          root: "./packages/solid",
        },
      },
      {
        extends: true,
        test: {
          include: ["src/**/*.test.ts"],
          name: "@coexist/storage",
          root: "./packages/storage",
        },
      },
      {
        extends: true,
        test: {
          include: ["src/**/*.test.ts"],
          name: "@coexist/svelte",
          root: "./packages/svelte",
        },
      },
      {
        extends: true,
        test: {
          include: ["src/**/*.test.ts"],
          name: "@coexist/testing",
          root: "./packages/testing",
        },
      },
      {
        extends: true,
        test: {
          include: ["src/**/*.test.ts"],
          name: "@coexist/example-testing",
          root: "./examples/testing",
        },
      },
      {
        extends: true,
        test: {
          include: ["src/**/*.test.ts"],
          name: "@coexist/vue",
          root: "./packages/vue",
        },
      },
    ],
  },
});
