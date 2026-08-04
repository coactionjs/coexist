// Shared harness for the installed-package smoke scripts.
//
// Every smoke script packs the workspace packages into tarballs, installs them
// into a throwaway consumer project, and runs the result. Only the consumer
// project differs between scripts; this module owns the parts that do not.
//
// These scripts run through tsx and are not part of any tsconfig, so they stay
// in plain JavaScript syntax.
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Captured output ceiling; browser and install logs are the largest producers. */
const maxOutputBuffer = 1024 * 1024 * 20;

export const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const packagesDir = join(rootDir, "packages");
export const examplesDir = join(rootDir, "examples");
export const workspacePath = join(rootDir, "pnpm-workspace.yaml");
export const lockfilePath = join(rootDir, "pnpm-lock.yaml");

/**
 * Run a command and return its captured output.
 *
 * Failures are rethrown as an Error naming the command, its arguments, and the
 * working directory, with the captured streams in the message and the original
 * exec error as `cause`.
 */
export async function run(command, args, cwd) {
  try {
    return await execFileAsync(command, args, {
      cwd,
      maxBuffer: maxOutputBuffer,
    });
  } catch (error) {
    const stdout = error.stdout === undefined ? "" : `\nstdout:\n${error.stdout}`;
    const stderr = error.stderr === undefined ? "" : `\nstderr:\n${error.stderr}`;

    throw new Error(`${command} ${args.join(" ")} failed in ${cwd}.${stdout}${stderr}`, {
      cause: error,
    });
  }
}

/**
 * Read the `catalog:` block from pnpm-workspace.yaml as a name → version map so
 * consumer projects pin the same dependency versions as the workspace.
 */
export async function readCatalog() {
  const workspaceYaml = await readFile(workspacePath, "utf8");
  const catalog = new Map();
  let inCatalog = false;
  let catalogIndent = 0;

  for (const line of workspaceYaml.split("\n")) {
    if (/^\s*catalog:\s*$/.test(line)) {
      inCatalog = true;
      catalogIndent = line.match(/^\s*/)?.[0].length ?? 0;
      continue;
    }

    if (!inCatalog || line.trim() === "" || line.trimStart().startsWith("#")) {
      continue;
    }

    const indent = line.match(/^\s*/)?.[0].length ?? 0;

    if (indent <= catalogIndent) {
      break;
    }

    const match = line.match(/^\s*(?:"([^"]+)"|([^:]+)):\s*(?:"([^"]+)"|(.+))\s*$/);

    if (match !== null) {
      const name = match[1] ?? match[2]?.trim();
      const version = match[3] ?? match[4]?.trim();

      if (name !== undefined && version !== undefined) {
        catalog.set(name, version);
      }
    }
  }

  return catalog;
}

/**
 * Build a packer that writes tarballs under `tarballsDir`.
 *
 * The returned function accepts either a workspace package name
 * (`"@coexist/core"`) or an explicit `{ name, dir }` pair for packages that do
 * not live under `packages/<name>`, and resolves to the tarball path.
 */
export function createPackPackage(tarballsDir) {
  return async function packPackage(target) {
    const name = typeof target === "string" ? target : target.name;
    const packageDir =
      typeof target === "string" ? join(packagesDir, name.slice("@coexist/".length)) : target.dir;
    const destination = join(tarballsDir, name.replaceAll("@", "").replaceAll("/", "__"));

    await mkdir(destination, { recursive: true });
    await run("pnpm", ["pack", "--pack-destination", destination], packageDir);

    const tarballs = (await readdir(destination)).filter((file) => file.endsWith(".tgz"));

    if (tarballs.length !== 1) {
      throw new Error(`${name} must produce exactly one tarball.`);
    }

    return join(destination, tarballs[0]);
  };
}
