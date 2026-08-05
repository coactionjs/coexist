import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createCoexistProject } from "./index.js";

const roots: string[] = [];
const execFileAsync = promisify(execFile);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("create package", () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
  });

  it("scaffolds a minimal Coexist project", async () => {
    const root = await mkdtemp(join(tmpdir(), "coexist-create-"));
    roots.push(root);

    const result = await createCoexistProject({
      name: "demo",
      root,
    });

    expect(result.files).toEqual(["package.json", "tsconfig.json", "src/main.ts"]);
    await expect(readFile(join(root, "package.json"), "utf8")).resolves.toContain(
      '"type": "module"',
    );
    await expect(readFile(join(root, "package.json"), "utf8")).resolves.toContain(
      '"packageManager": "pnpm@11.8.0"',
    );
    await expect(readFile(join(root, "tsconfig.json"), "utf8")).resolves.toContain(
      '"skipLibCheck": true',
    );
    await expect(readFile(join(root, "src/main.ts"), "utf8")).resolves.toContain("createApp");
  });

  it("pins scaffolded dependencies instead of tracking latest", async () => {
    const root = await mkdtemp(join(tmpdir(), "coexist-create-pins-"));
    roots.push(root);

    await createCoexistProject({ name: "demo", root });

    const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const createVersion = (
      JSON.parse(await readFile(join(repoRoot, "packages/create/package.json"), "utf8")) as {
        version: string;
      }
    ).version;

    // "latest" would make the same CLI build produce a different project on
    // every run, eventually one its own template no longer compiles against.
    expect(Object.values({ ...manifest.dependencies, ...manifest.devDependencies })).not.toContain(
      "latest",
    );
    expect(manifest.dependencies["@coexist/core"]).toBe(`^${createVersion}`);
  });

  it("refuses to overwrite a non-empty target without force", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "coexist-create-guard-"));
    roots.push(workspace);
    const root = join(workspace, "existing");
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "package.json"), '{ "name": "do-not-clobber" }\n');

    await expect(createCoexistProject({ name: "demo", root })).rejects.toThrow("is not empty");
    await expect(readFile(join(root, "package.json"), "utf8")).resolves.toContain("do-not-clobber");

    await createCoexistProject({ force: true, name: "demo", root });

    await expect(readFile(join(root, "package.json"), "utf8")).resolves.toContain('"name": "demo"');
  });

  it("rejects target names npm would refuse", async () => {
    const root = await mkdtemp(join(tmpdir(), "coexist-create-name-"));
    roots.push(root);

    await Promise.all(
      ["Demo", ".demo", "my app", ""].map(async (name) => {
        await expect(createCoexistProject({ name, root })).rejects.toThrow(
          "is not a valid npm package name",
        );
      }),
    );

    await expect(readdir(root)).resolves.toEqual([]);
  });

  it("leaves nothing behind when scaffolding fails midway", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "coexist-create-atomic-"));
    roots.push(workspace);
    const root = join(workspace, "app");

    await expect(createCoexistProject({ name: "Invalid Name", root })).rejects.toThrow(
      "is not a valid npm package name",
    );

    await expect(readdir(workspace)).resolves.toEqual([]);
  });

  it("generates a project entrypoint that typechecks against the current core package", async () => {
    const root = await mkdtemp(join(tmpdir(), "coexist-create-e2e-"));
    roots.push(root);
    await createCoexistProject({
      name: "demo",
      root,
    });
    await writeFile(
      join(root, "tsconfig.e2e.json"),
      `${JSON.stringify(
        {
          extends: "./tsconfig.json",
          compilerOptions: {
            baseUrl: ".",
            ignoreDeprecations: "6.0",
            lib: ["DOM", "ESNext"],
            noEmit: true,
            paths: {
              "@coexist/core": [join(repoRoot, "packages/core/src/index.ts")],
            },
          },
        },
        null,
        2,
      )}\n`,
    );

    await expect(
      execFileAsync(join(repoRoot, "node_modules/.bin/tsc"), ["-p", "tsconfig.e2e.json"], {
        cwd: root,
      }),
    ).resolves.toMatchObject({
      stderr: "",
      stdout: "",
    });
  });

  it("scaffolds a project through the CLI entrypoint", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "coexist-create-cli-"));
    roots.push(workspace);
    const target = "cli-demo";
    const root = join(workspace, target);
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(workspace);
    const logs: unknown[][] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args);
    });
    const originalArgv = process.argv;

    process.argv = [process.execPath, "create-coexist", target];

    try {
      await import("./cli.js");
    } finally {
      process.argv = originalArgv;
      cwd.mockRestore();
      log.mockRestore();
    }

    expect(logs).toEqual([[`Created Coexist project at ${root}`]]);
    await expect(readFile(join(root, "package.json"), "utf8")).resolves.toContain(
      '"name": "cli-demo"',
    );
    await expect(readFile(join(root, "src/main.ts"), "utf8")).resolves.toContain(
      "console.log(app.store.getPureState())",
    );
  });
});
