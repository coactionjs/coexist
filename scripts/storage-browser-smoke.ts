#!/usr/bin/env node
import { createServer } from "node:http";
import { accessSync, constants } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

import { createPackPackage, lockfilePath, readCatalog, run } from "./lib/smoke.ts";

const tempDir = await mkdtemp(join(tmpdir(), "coexist-storage-browser-"));
const tarballsDir = join(tempDir, "tarballs");
const packPackage = createPackPackage(tarballsDir);
const consumerDir = join(tempDir, "consumer");
const chromeExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? findSystemChrome();

let browser;
let server;

try {
  const catalog = await readCatalog();
  const coreTarball = await packPackage("@coexist/core");
  const storageTarball = await packPackage("@coexist/storage");

  await writeConsumerProject(coreTarball, storageTarball, catalog);
  await run("pnpm", ["install", "--prefer-offline", "--no-frozen-lockfile"], consumerDir);
  await run("pnpm", ["run", "typecheck"], consumerDir);
  await run("pnpm", ["run", "build"], consumerDir);

  server = await createStaticServer(join(consumerDir, "dist"));
  browser = await launchBrowser();

  await runStorageSmoke(browser, server.url);

  console.log("Verified installed storage plugin browser localStorage persistence.");
} finally {
  await browser?.close();
  await server?.close();
  await rm(tempDir, { force: true, recursive: true });
}

async function writeConsumerProject(coreTarball, storageTarball, catalog) {
  await mkdir(join(consumerDir, "src"), { recursive: true });
  await writeFile(
    join(consumerDir, "package.json"),
    `${JSON.stringify(
      {
        name: "coexist-storage-browser-smoke",
        private: true,
        type: "module",
        scripts: {
          build: "vite build --logLevel error",
          typecheck: "tsc -p tsconfig.json --noEmit",
        },
        dependencies: {
          "@coexist/core": `file:${coreTarball}`,
          "@coexist/storage": `file:${storageTarball}`,
          coaction: readCatalogVersion(catalog, "coaction"),
          localspace: readCatalogVersion(catalog, "localspace"),
        },
        devDependencies: {
          typescript: readCatalogVersion(catalog, "typescript"),
          vite: readCatalogVersion(catalog, "vite"),
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
      "allowBuilds:",
      '  "@parcel/watcher": true',
      "  esbuild: true",
      "overrides:",
      `  "@coexist/core": ${JSON.stringify(`file:${coreTarball}`)}`,
      `  "@coexist/storage": ${JSON.stringify(`file:${storageTarball}`)}`,
      `  "coaction": ${JSON.stringify(readCatalogVersion(catalog, "coaction"))}`,
      `  "localspace": ${JSON.stringify(readCatalogVersion(catalog, "localspace"))}`,
      `  "typescript": ${JSON.stringify(readCatalogVersion(catalog, "typescript"))}`,
      `  "vite": ${JSON.stringify(readCatalogVersion(catalog, "vite"))}`,
      "",
    ].join("\n"),
  );
  await writeFile(
    join(consumerDir, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          lib: ["DOM", "DOM.Iterable", "ES2023"],
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          skipLibCheck: true,
          strict: true,
          target: "ES2022",
        },
        include: ["src/main.ts"],
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(consumerDir, "index.html"),
    [
      "<!doctype html>",
      '<html lang="en">',
      "  <head>",
      '    <meta charset="UTF-8" />',
      '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      "    <title>Coexist storage browser smoke</title>",
      "  </head>",
      "  <body>",
      '    <main aria-label="Storage smoke">',
      "      <h1>Storage browser smoke</h1>",
      "      <dl>",
      '        <div><dt>Status</dt><dd id="status">starting</dd></div>',
      '        <div><dt>Driver</dt><dd id="driver">unknown</dd></div>',
      '        <div><dt>Count</dt><dd id="count">0</dd></div>',
      '        <div><dt>Stored count</dt><dd id="stored-count">empty</dd></div>',
      '        <div><dt>Raw localStorage</dt><dd id="raw-state">missing</dd></div>',
      "      </dl>",
      '      <button type="button" id="increase">Increase</button>',
      '      <button type="button" id="clear">Clear stored state</button>',
      "    </main>",
      '    <script type="module" src="/src/main.ts"></script>',
      "  </body>",
      "</html>",
      "",
    ].join("\n"),
  );
  await writeFile(join(consumerDir, "src/main.ts"), createBrowserSource());
}

function createBrowserSource() {
  return `import { createApp, defineModule } from "@coexist/core";
import {
  createLocalSpaceStoragePlugin,
  localStorageDriver,
  type LocalSpaceStoragePlugin,
} from "@coexist/storage";

type AppState = {
  readonly storageBrowserCounter?: {
    readonly count: number;
  };
};

type SmokeSnapshot = {
  readonly count: number;
  readonly driver: string | null;
  readonly hasRawState: boolean;
  readonly storedCount: number | null;
};

declare global {
  interface Window {
    __coexistStorageSmoke?: {
      readonly ready: Promise<void>;
      clear(): Promise<void>;
      increase(): Promise<void>;
      read(): Promise<SmokeSnapshot>;
    };
  }
}

const storageName = "coexist-storage-browser-smoke";
const storageStoreName = "state";
const storageKey = "app";
const rawStorageKey = \`\${storageName}/\${storageStoreName}/\${storageKey}\`;

class StorageBrowserCounter {
  count = 0;

  increase(): void {
    this.count += 1;
  }
}

defineModule(StorageBrowserCounter, {
  actions: ["increase"],
  name: "storageBrowserCounter",
  state: ["count"],
});

const plugin = createLocalSpaceStoragePlugin<AppState>({
  key: storageKey,
  options: {
    driver: localStorageDriver._driver,
    name: storageName,
    storeName: storageStoreName,
  },
});
const app = createApp({
  plugins: [plugin],
  providers: [StorageBrowserCounter],
});

let counter: StorageBrowserCounter;

const ready = start();

window.__coexistStorageSmoke = {
  ready,
  clear,
  increase,
  read,
};

getElement<HTMLButtonElement>("increase").addEventListener("click", () => {
  void runButtonAction(increase);
});
getElement<HTMLButtonElement>("clear").addEventListener("click", () => {
  void runButtonAction(clear);
});

async function start(): Promise<void> {
  await app.start();
  counter = app.getModule(StorageBrowserCounter);
  await render("ready");
}

async function increase(): Promise<void> {
  counter.increase();
  await plugin.flush();
  await render("ready");
}

async function clear(): Promise<void> {
  await plugin.clear();
  await plugin.flush();
  await render("ready");
}

async function read(): Promise<SmokeSnapshot> {
  const stored = await plugin.storage.get<AppState>(storageKey);

  return {
    count: counter.count,
    driver: plugin.storage.driver(),
    hasRawState: localStorage.getItem(rawStorageKey) !== null,
    storedCount: stored?.storageBrowserCounter?.count ?? null,
  };
}

async function render(status: string): Promise<void> {
  const snapshot = await read();

  getElement("status").textContent = status;
  getElement("driver").textContent = snapshot.driver ?? "none";
  getElement("count").textContent = String(snapshot.count);
  getElement("stored-count").textContent =
    snapshot.storedCount === null ? "empty" : String(snapshot.storedCount);
  getElement("raw-state").textContent = snapshot.hasRawState ? "present" : "missing";
}

async function runButtonAction(action: () => Promise<void>): Promise<void> {
  try {
    getElement("status").textContent = "working";
    await action();
  } catch (error) {
    getElement("status").textContent = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

function getElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (element === null) {
    throw new Error(\`Missing element: \${id}\`);
  }

  return element as T;
}
`;
}

async function runStorageSmoke(browserInstance, url) {
  const context = await browserInstance.newContext();
  const page = await context.newPage();
  const errors = [];

  page.on("pageerror", (error) => {
    errors.push(error.stack ?? error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });

  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await expectStorageState(page, {
      count: "0",
      rawState: "missing",
      storedCount: "empty",
    });

    await clickButton(page, "Increase");
    await clickButton(page, "Increase");
    await expectStorageState(page, {
      count: "2",
      rawState: "present",
      storedCount: "2",
    });

    await page.reload({ waitUntil: "networkidle" });
    await expectStorageState(page, {
      count: "2",
      rawState: "present",
      storedCount: "2",
    });

    await clickButton(page, "Increase");
    await expectStorageState(page, {
      count: "3",
      rawState: "present",
      storedCount: "3",
    });

    await page.reload({ waitUntil: "networkidle" });
    await expectStorageState(page, {
      count: "3",
      rawState: "present",
      storedCount: "3",
    });

    await clickButton(page, "Clear stored state");
    await expectStorageState(page, {
      count: "3",
      rawState: "missing",
      storedCount: "empty",
    });

    await page.reload({ waitUntil: "networkidle" });
    await expectStorageState(page, {
      count: "0",
      rawState: "missing",
      storedCount: "empty",
    });

    if (errors.length > 0) {
      throw new Error(`Storage browser smoke emitted browser errors:\n${errors.join("\n")}`);
    }
  } finally {
    await context.close();
  }
}

async function expectStorageState(page, expected) {
  await waitForStorageSmoke(page);
  await expectStat(page, "Status", "ready");
  await expectStat(page, "Driver", "localStorageWrapper");
  await expectStat(page, "Count", expected.count);
  await expectStat(page, "Stored count", expected.storedCount);
  await expectStat(page, "Raw localStorage", expected.rawState);

  const snapshot = await page.evaluate(() => window["__coexistStorageSmoke"]?.read());

  if (snapshot === undefined) {
    throw new Error("Storage smoke API was not exposed.");
  }

  if (
    snapshot.count !== Number(expected.count) ||
    snapshot.driver !== "localStorageWrapper" ||
    snapshot.hasRawState !== (expected.rawState === "present") ||
    snapshot.storedCount !==
      (expected.storedCount === "empty" ? null : Number(expected.storedCount))
  ) {
    throw new Error(`Storage smoke state mismatch: ${JSON.stringify(snapshot)}`);
  }
}

async function waitForStorageSmoke(page) {
  await page.waitForFunction(() => window["__coexistStorageSmoke"] !== undefined);
  await page.evaluate(() => window["__coexistStorageSmoke"]?.ready);
}

async function expectStat(page, label, expected) {
  await page.waitForFunction(
    ({ expectedValue, labelText }) => {
      const labels = [...document.querySelectorAll("dt")];
      const labelElement = labels.find((element) => element.textContent?.trim() === labelText);
      const valueElement = labelElement?.parentElement?.querySelector("dd");

      return valueElement?.textContent?.trim() === expectedValue;
    },
    { expectedValue: expected, labelText: label },
  );
}

async function clickButton(page, label) {
  await page.getByRole("button", { name: label }).click();
}

async function launchBrowser() {
  try {
    return await chromium.launch({
      executablePath: chromeExecutable,
      headless: true,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    throw new Error(
      [
        "Unable to launch Chromium for storage browser smoke.",
        "Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to a Chromium/Chrome binary, or run `pnpm exec playwright install chromium`.",
        detail,
      ].join("\n"),
      { cause: error },
    );
  }
}

async function createStaticServer(root) {
  const indexPath = join(root, "index.html");

  await assertReadableFile(indexPath);

  const serverInstance = createServer(async (request, response) => {
    try {
      if (new URL(request.url ?? "/", "http://127.0.0.1").pathname === "/favicon.ico") {
        response.writeHead(204);
        response.end();
        return;
      }

      const filePath = await resolveRequestPath(root, request.url ?? "/");
      const body = await readFile(filePath);

      response.writeHead(200, {
        "Content-Type": contentType(filePath),
      });
      response.end(body);
    } catch (error) {
      response.writeHead(error?.code === "ENOENT" ? 404 : 500, {
        "Content-Type": "text/plain; charset=utf-8",
      });
      response.end(error instanceof Error ? error.message : "Internal server error");
    }
  });

  await new Promise((done, reject) => {
    serverInstance.once("error", reject);
    serverInstance.listen(0, "127.0.0.1", done);
  });

  const address = serverInstance.address();

  if (address === null || typeof address === "string") {
    throw new Error("Static server did not expose a TCP address.");
  }

  return {
    close() {
      return new Promise((done, reject) => {
        serverInstance.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          done();
        });
      });
    },
    url: `http://127.0.0.1:${address.port}/`,
  };
}

async function resolveRequestPath(root, requestUrl) {
  const url = new URL(requestUrl, "http://127.0.0.1");
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = resolve(root, `.${decodeURIComponent(pathname)}`);
  const normalizedRoot = `${normalize(root)}${root.endsWith("/") ? "" : "/"}`;

  if (!normalize(filePath).startsWith(normalizedRoot)) {
    throw Object.assign(new Error("Forbidden path."), { code: "ENOENT" });
  }

  const fileStat = await stat(filePath);

  if (fileStat.isDirectory()) {
    return join(filePath, "index.html");
  }

  return filePath;
}

function contentType(filePath) {
  switch (extname(filePath)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".map":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

async function assertReadableFile(path) {
  const fileStat = await stat(path);

  if (!fileStat.isFile()) {
    throw new Error(`Missing built browser storage asset: ${path}`);
  }
}

function readCatalogVersion(catalog, name) {
  const version = catalog.get(name);

  if (version === undefined) {
    throw new Error(`${name} is missing from pnpm-workspace.yaml catalog.`);
  }

  return version;
}

function findSystemChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.GOOGLE_CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (canReadSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function canReadSync(path) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
