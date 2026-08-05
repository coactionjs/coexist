import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export interface CreateCoexistProjectOptions {
  readonly root: string;
  readonly name: string;
  readonly packageManager?: string;
  /**
   * Write into a directory that already has contents. Without it a non-empty
   * target is refused, because scaffolding overwrites `package.json`,
   * `tsconfig.json`, and `src/main.ts` without asking.
   */
  readonly force?: boolean;
}

export interface CreatedCoexistProject {
  readonly root: string;
  readonly files: readonly string[];
}

const projectFiles = ["package.json", "tsconfig.json", "src/main.ts"] as const;

/**
 * Versions the generated project is pinned to. `latest` would make the same
 * CLI build produce a different — eventually incompatible — project every time
 * it runs, which is the opposite of what a scaffold should guarantee.
 *
 * Keep the floors in step with the catalog in `pnpm-workspace.yaml`; those are
 * the versions the scaffold smoke tests actually build and run.
 */
const scaffoldDependencies = {
  tsx: "^4.22.4",
  typescript: "^6.0.3",
} as const;

export async function createCoexistProject(
  options: CreateCoexistProjectOptions,
): Promise<CreatedCoexistProject> {
  const packageManager = options.packageManager ?? "pnpm@11.8.0";
  const root = resolve(options.root);
  assertValidPackageName(options.name);
  await assertWritableTarget(root, options.force ?? false);

  const coreVersion = await readCoreDependencyRange();
  const staging = await mkdtemp(join(dirname(root), ".coexist-create-"));

  try {
    await mkdir(join(staging, "src"), { recursive: true });
    await writeFile(
      join(staging, "package.json"),
      `${JSON.stringify(createPackageJson(options.name, packageManager, coreVersion), null, 2)}\n`,
    );
    await writeFile(
      join(staging, "tsconfig.json"),
      `${JSON.stringify(createTsConfig(), null, 2)}\n`,
    );
    await writeFile(join(staging, "src/main.ts"), createMainSource());
    // Everything is written before anything lands in the target, so an
    // interrupted run cannot leave a half-scaffolded project behind.
    await commitStagedProject(staging, root);
  } catch (error) {
    await rm(staging, { force: true, recursive: true });
    throw error;
  }

  return {
    files: projectFiles,
    root,
  };
}

async function assertWritableTarget(root: string, force: boolean): Promise<void> {
  const entries = await readTargetEntries(root);

  if (entries === undefined || entries.length === 0 || force) {
    return;
  }

  throw new Error(
    `${root} is not empty. Scaffolding overwrites ${projectFiles.join(", ")}; ` +
      "choose an empty directory or pass --force to overwrite.",
  );
}

async function readTargetEntries(root: string): Promise<string[] | undefined> {
  try {
    return await readdir(root);
  } catch (error) {
    if (isMissingPathError(error)) {
      return undefined;
    }

    throw error;
  }
}

async function commitStagedProject(staging: string, root: string): Promise<void> {
  const entries = await readTargetEntries(root);

  if (entries === undefined) {
    await mkdir(dirname(root), { recursive: true });
    await rename(staging, root);
    return;
  }

  if (entries.length === 0) {
    await rm(root, { recursive: true });
    await rename(staging, root);
    return;
  }

  // A forced overwrite keeps whatever else the directory holds and replaces
  // only the files this scaffold owns.
  await mkdir(join(root, "src"), { recursive: true });
  await Promise.all(projectFiles.map((file) => rename(join(staging, file), join(root, file))));
  await rm(staging, { force: true, recursive: true });
}

/**
 * Rejects names npm itself would reject, so a scaffolded project cannot fail on
 * its first install with an error that points at the template rather than the
 * name that was typed.
 */
function assertValidPackageName(name: string): void {
  const problem = findPackageNameProblem(name);

  if (problem !== undefined) {
    throw new Error(`${JSON.stringify(name)} is not a valid npm package name: ${problem}`);
  }
}

function findPackageNameProblem(name: string): string | undefined {
  if (name.length === 0) {
    return "it is empty.";
  }

  if (name.length > 214) {
    return "it is longer than 214 characters.";
  }

  if (name !== name.toLowerCase()) {
    return "it contains uppercase characters.";
  }

  if (name.startsWith(".") || name.startsWith("_")) {
    return "it starts with a dot or underscore.";
  }

  if (name.trim() !== name) {
    return "it has leading or trailing whitespace.";
  }

  return /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name)
    ? undefined
    : "it contains characters that are not URL-safe.";
}

async function readCoreDependencyRange(): Promise<string> {
  // The scaffold pins the core release that matches this CLI build, so a
  // project generated today stays buildable when a later major ships.
  const manifest = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as {
    readonly version?: unknown;
  };

  if (typeof manifest.version !== "string" || manifest.version.length === 0) {
    throw new Error("@coexist/create could not read its own version.");
  }

  return `^${manifest.version}`;
}

function isMissingPathError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

function createPackageJson(name: string, packageManager: string, coreVersion: string): object {
  return {
    name,
    private: true,
    type: "module",
    scripts: {
      build: "tsc -p tsconfig.json",
      start: "tsx src/main.ts",
    },
    dependencies: {
      "@coexist/core": coreVersion,
    },
    devDependencies: {
      tsx: scaffoldDependencies.tsx,
      typescript: scaffoldDependencies.typescript,
    },
    packageManager,
  };
}

function createTsConfig(): object {
  return {
    compilerOptions: {
      module: "NodeNext",
      moduleResolution: "NodeNext",
      skipLibCheck: true,
      strict: true,
      target: "ES2022",
    },
    include: ["src/**/*.ts"],
  };
}

function createMainSource(): string {
  return `import { createApp, defineModule } from "@coexist/core";

class Counter {
  count = 0;

  increase(): void {
    this.count += 1;
  }
}

defineModule(Counter, {
  actions: ["increase"],
  name: "counter",
  state: ["count"],
});

const app = createApp({
  providers: [Counter],
});

const counter = app.getModule(Counter);
counter.increase();

console.log(app.store.getPureState());
`;
}
