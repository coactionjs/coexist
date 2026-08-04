#!/usr/bin/env node
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPackPackage, lockfilePath, readCatalog, rootDir, run } from "./lib/smoke.ts";

const tempDir = await mkdtemp(join(tmpdir(), "coexist-core-lifecycle-scope-"));
const tarballsDir = join(tempDir, "tarballs");
const packPackage = createPackPackage(tarballsDir);
const consumerDir = join(tempDir, "consumer");
const tscBin = join(rootDir, "node_modules/.bin/tsc");

try {
  const catalog = await readCatalog();
  const coreTarball = await packPackage("@coexist/core");

  await writeConsumerProject(coreTarball, catalog);
  await run(
    "pnpm",
    ["install", "--prefer-offline", "--no-frozen-lockfile", "--ignore-scripts"],
    consumerDir,
  );
  await run(tscBin, ["-p", "tsconfig.json"], consumerDir);
  await run(process.execPath, ["runtime.mjs"], consumerDir);

  console.log("Verified installed core lifecycle and provider scopes.");
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

async function writeConsumerProject(coreTarball, catalog) {
  await mkdir(consumerDir, { recursive: true });
  await writeFile(
    join(consumerDir, "package.json"),
    `${JSON.stringify(
      {
        name: "coexist-core-lifecycle-scope-smoke",
        private: true,
        type: "module",
        dependencies: {
          "@coexist/core": `file:${coreTarball}`,
          coaction: readCatalogVersion(catalog, "coaction"),
        },
        devDependencies: {
          typescript: readCatalogVersion(catalog, "typescript"),
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(join(consumerDir, "pnpm-lock.yaml"), await readFile(lockfilePath, "utf8"));
  await writeFile(
    join(consumerDir, "pnpm-workspace.yaml"),
    [
      "minimumReleaseAgeExclude:",
      `  - ${JSON.stringify(`coaction@${readCatalogVersion(catalog, "coaction")}`)}`,
      "overrides:",
      `  "@coexist/core": ${JSON.stringify(`file:${coreTarball}`)}`,
      `  "coaction": ${JSON.stringify(readCatalogVersion(catalog, "coaction"))}`,
      `  "typescript": ${JSON.stringify(readCatalogVersion(catalog, "typescript"))}`,
      "",
    ].join("\n"),
  );
  await writeFile(
    join(consumerDir, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          lib: ["ES2023"],
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          skipLibCheck: true,
          strict: true,
          target: "ES2022",
        },
        include: ["index.ts"],
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(join(consumerDir, "index.ts"), createTypeConsumerSource());
  await writeFile(join(consumerDir, "runtime.mjs"), createRuntimeConsumerSource());
}

function createTypeConsumerSource() {
  return `import {
  createApp,
  createContainer,
  defineModule,
  provide,
  token,
  type App,
  type Plugin,
} from "@coexist/core";

class TypeModule {
  value = 0;

  increase(): number {
    this.value += 1;
    return this.value;
  }
}

defineModule(TypeModule, {
  actions: ["increase"],
  name: "typeModule",
  state: ["value"],
});

class ScopedService {
  readonly id = Symbol("scoped");
}

const MultiToken = token<string>("MultiToken");
const app: App = createApp({
  plugins: [
    {
      name: "typePlugin",
      setup(instance: App, context): void {
        void instance;
        void context.inject(TypeModule);
      },
    } satisfies Plugin,
  ],
  providers: [
    TypeModule,
    provide(ScopedService, {
      scope: "scoped",
      useClass: ScopedService,
    }),
    provide(MultiToken, {
      multi: true,
      useValue: "first",
    }),
    provide(MultiToken, {
      multi: true,
      useValue: "second",
    }),
  ],
});
const scope = app.createScope();
const container = createContainer({ strictScopes: false });
const ready: Promise<void> = app.ready;

container.provide(ScopedService);

void [ready, app.getAll(MultiToken), scope.container.get(ScopedService), container.get(ScopedService)];
`;
}

function createRuntimeConsumerSource() {
  return `import {
  createApp,
  createContainer,
  defineModule,
  provide,
  token,
} from "@coexist/core";

const events = [];
const disposeEvents = [];
const MultiToken = token("MultiToken");
const EagerToken = token("EagerToken");
const LifecycleEventToken = token("LifecycleEventToken");

class LifecycleModule {
  value = 0;

  increase(step = 1) {
    this.value += step;
    return this.value;
  }

  async onInit(context) {
    await Promise.resolve();
    context.inject(LifecycleEventToken)("module:init");
  }

  async onStart(context) {
    await Promise.resolve();
    context.inject(LifecycleEventToken)("module:start");
  }

  async onStop(context) {
    await Promise.resolve();
    context.inject(LifecycleEventToken)("module:stop");
  }

  async onDispose(context) {
    await Promise.resolve();
    context.inject(LifecycleEventToken)("module:dispose");
  }
}

defineModule(LifecycleModule, {
  actions: ["increase"],
  name: "lifecycle",
  state: ["value"],
});

class ScopedService {
  constructor() {
    this.id = Symbol("scoped");
  }
}

class TransientService {
  constructor() {
    this.id = Symbol("transient");
  }
}

class ResolutionService {
  constructor() {
    this.id = Symbol("resolution");
  }
}

class UsesResolution {
  constructor(first, second) {
    this.first = first;
    this.second = second;
  }
}

const app = createApp({
  plugins: [
    {
      name: "lifecyclePlugin",
      onModuleCreated(event, context) {
        events.push("created:" + context.name + ":" + event.name);
      },
      async setup(runtimeApp, context) {
        events.push("plugin:setup:" + context.name);
        await Promise.resolve();
        context.inject(LifecycleEventToken)("plugin:inject");
        await runtimeApp.start().catch((error) => {
          events.push("plugin:start-rejected:" + error.message);
        });
        context.onDispose(() => {
          events.push("plugin:onDispose");
        });
      },
      dispose(context) {
        events.push("plugin:dispose:" + context.name);
      },
    },
  ],
  providers: [
    LifecycleModule,
    provide(LifecycleEventToken, {
      useValue(event) {
        events.push(event);
      },
    }),
    provide(ScopedService, {
      dispose(value) {
        disposeEvents.push("scoped:" + String(value.id));
      },
      scope: "scoped",
      useClass: ScopedService,
    }),
    provide(MultiToken, {
      multi: true,
      useValue: "first",
    }),
    provide(MultiToken, {
      multi: true,
      useValue: "second",
    }),
    provide(EagerToken, {
      dispose(value) {
        disposeEvents.push("eager:" + value.id);
      },
      eager: true,
      useFactory() {
        return { id: "ready" };
      },
    }),
  ],
});

const ready = app.ready;
expectSame(app.ready, ready, "app readiness promise is stable");
await app.start();
await ready;
const lifecycleModule = app.getModule(LifecycleModule);
expectEqual(lifecycleModule.increase(2), 2, "module action returns updated value");
expectEqual(app.get(LifecycleModule).value, 2, "module state is mutated through action");
expectArrayEqual(app.getAll(MultiToken), ["first", "second"], "multi provider order");
expectEqual(app.get(EagerToken).id, "ready", "eager provider value");

const firstScope = app.createScope();
const secondScope = app.createScope();
const firstScopedA = firstScope.container.get(ScopedService);
const firstScopedB = firstScope.container.get(ScopedService);
const secondScoped = secondScope.container.get(ScopedService);

expectSame(firstScopedA, firstScopedB, "scoped provider is reused in one scope");
expectNotSame(firstScopedA, secondScoped, "scoped provider is isolated between scopes");

const container = createContainer({ strictScopes: false });

container.provide(
  provide(TransientService, {
    dispose(value) {
      disposeEvents.push("transient:" + String(value.id));
    },
    scope: "transient",
    useClass: TransientService,
  }),
);
container.provide(
  provide(ResolutionService, {
    dispose(value) {
      disposeEvents.push("resolution:" + String(value.id));
    },
    scope: "resolution",
    useClass: ResolutionService,
  }),
);
container.provide(
  provide(UsesResolution, {
    deps: [ResolutionService, ResolutionService],
    scope: "resolution",
    useClass: UsesResolution,
  }),
);

expectNotSame(
  container.get(TransientService),
  container.get(TransientService),
  "transient provider creates a fresh value per lookup",
);

const usesResolution = container.get(UsesResolution);

expectSame(
  usesResolution.first,
  usesResolution.second,
  "resolution provider is shared within one dependency graph",
);
expectNotSame(
  container.get(ResolutionService),
  container.get(ResolutionService),
  "resolution provider is not cached across top-level lookups",
);

await container.dispose();
await firstScope.container.dispose();
await secondScope.container.dispose();
await app.stop();
await app.dispose();

expectThrows(
  () => lifecycleModule.increase(),
  "Cannot run module actions after app disposal has begun.",
  "retained module actions are terminal",
);
expectThrows(
  () => app.getModule(LifecycleModule),
  "Cannot access modules after app disposal has begun.",
  "module lookup is terminal",
);

expectArrayEqual(
  events,
  [
    "created:lifecyclePlugin:lifecycle",
    "plugin:setup:lifecyclePlugin",
    "plugin:inject",
    "plugin:start-rejected:Cannot call start() from app-managed setup work.",
    "module:init",
    "module:start",
    "module:stop",
    "module:dispose",
    "plugin:dispose:lifecyclePlugin",
    "plugin:onDispose",
  ],
  "lifecycle and plugin event order",
);
expectIncludes(disposeEvents, "eager:ready", "eager provider is disposed");
expectEqual(
  disposeEvents.filter((event) => event.startsWith("scoped:")).length,
  2,
  "created app scopes are disposed by their containers",
);
expectEqual(
  disposeEvents.filter((event) => event.startsWith("transient:")).length,
  2,
  "transient instances are disposed by their container",
);
expectEqual(
  disposeEvents.filter((event) => event.startsWith("resolution:")).length,
  3,
  "resolution instances are disposed by their container",
);

function expectEqual(actual, expected, label) {
  if (!Object.is(actual, expected)) {
    throw new Error(label + ": expected " + String(expected) + ", got " + String(actual));
  }
}

function expectSame(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(label + ": expected references to match");
  }
}

function expectNotSame(actual, expected, label) {
  if (actual === expected) {
    throw new Error(label + ": expected references to differ");
  }
}

function expectArrayEqual(actual, expected, label) {
  if (actual.length !== expected.length) {
    throw new Error(
      label + ": expected length " + String(expected.length) + ", got " + String(actual.length),
    );
  }

  for (const [index, value] of actual.entries()) {
    if (!Object.is(value, expected[index])) {
      throw new Error(
        label +
          ": expected index " +
          String(index) +
          " to be " +
          String(expected[index]) +
          ", got " +
          String(value),
      );
    }
  }
}

function expectIncludes(values, expected, label) {
  if (!values.includes(expected)) {
    throw new Error(label + ": missing " + expected + " in " + values.join(", "));
  }
}

function expectThrows(callback, expectedMessage, label) {
  try {
    callback();
  } catch (error) {
    if (error instanceof Error && error.message === expectedMessage) {
      return;
    }

    throw new Error(label + ": unexpected error " + String(error));
  }

  throw new Error(label + ": expected an error");
}
`;
}

function readCatalogVersion(catalog, name) {
  const version = catalog.get(name);

  if (version === undefined) {
    throw new Error(`${name} is missing from pnpm-workspace.yaml catalog.`);
  }

  return version;
}
