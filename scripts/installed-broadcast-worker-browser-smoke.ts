#!/usr/bin/env node
/* eslint-disable no-underscore-dangle */
import { createServer } from "node:http";
import { accessSync, constants } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

import { createPackPackage, lockfilePath, readCatalog, run } from "./lib/smoke.ts";

const tempDir = await mkdtemp(join(tmpdir(), "coexist-broadcast-worker-browser-"));
const tarballsDir = join(tempDir, "tarballs");
const packPackage = createPackPackage(tarballsDir);
const consumerDir = join(tempDir, "consumer");
const chromeExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? findSystemChrome();

let browser;
let server;

try {
  const catalog = await readCatalog();
  const coreTarball = await packPackage("@coexist/core");

  await writeConsumerProject(coreTarball, catalog);
  await run("pnpm", ["install", "--prefer-offline", "--no-frozen-lockfile"], consumerDir);
  await run("pnpm", ["run", "typecheck"], consumerDir);
  await run("pnpm", ["run", "build"], consumerDir);

  server = await createStaticServer(join(consumerDir, "dist"));
  browser = await launchBrowser();

  await runBroadcastWorkerSmoke(browser, server.url);
  await runBroadcastTabSmoke(browser, server.url);

  console.log(
    "Verified installed broadcast worker browser transport, across tabs on default peer ids and a replacement host.",
  );
} finally {
  await browser?.close();
  await server?.close();
  await rm(tempDir, { force: true, recursive: true });
}

async function writeConsumerProject(coreTarball, catalog) {
  await mkdir(join(consumerDir, "src"), { recursive: true });
  await writeFile(
    join(consumerDir, "package.json"),
    `${JSON.stringify(
      {
        name: "coexist-broadcast-worker-browser-smoke",
        private: true,
        type: "module",
        scripts: {
          build: "vite build --logLevel error",
          typecheck: "tsc -p tsconfig.json --noEmit",
        },
        dependencies: {
          "@coexist/core": `file:${coreTarball}`,
          coaction: readCatalogVersion(catalog, "coaction"),
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
      `  "coaction": ${JSON.stringify(readCatalogVersion(catalog, "coaction"))}`,
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
        include: ["src/main.ts", "src/tabs.ts"],
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
      "    <title>Coexist broadcast worker browser smoke</title>",
      "  </head>",
      "  <body>",
      '    <main aria-label="Broadcast worker smoke">',
      "      <h1>Broadcast worker browser smoke</h1>",
      "      <dl>",
      '        <div><dt>Status</dt><dd id="status">starting</dd></div>',
      '        <div><dt>Client one count</dt><dd id="client-one-count">0</dd></div>',
      '        <div><dt>Client two count</dt><dd id="client-two-count">0</dd></div>',
      '        <div><dt>Client one version</dt><dd id="client-one-version">0</dd></div>',
      '        <div><dt>Client two version</dt><dd id="client-two-version">0</dd></div>',
      '        <div><dt>Client one watches</dt><dd id="client-one-watches">[]</dd></div>',
      '        <div><dt>Client two watches</dt><dd id="client-two-watches">[]</dd></div>',
      "      </dl>",
      '      <button type="button" id="increase-one">Increase from client one</button>',
      '      <button type="button" id="increase-two">Increase from client two</button>',
      "    </main>",
      '    <script type="module" src="/src/main.ts"></script>',
      "  </body>",
      "</html>",
      "",
    ].join("\n"),
  );
  await writeFile(join(consumerDir, "src/main.ts"), createBrowserSource());
  // Each tab of the second page evaluates its own copy of the runtime, which no
  // number of channels inside one page can reproduce.
  await writeFile(
    join(consumerDir, "tabs.html"),
    [
      "<!doctype html>",
      '<html lang="en">',
      "  <head>",
      '    <meta charset="UTF-8" />',
      "    <title>Coexist broadcast tab smoke</title>",
      "  </head>",
      "  <body>",
      '    <script type="module" src="/src/tabs.ts"></script>',
      "  </body>",
      "</html>",
      "",
    ].join("\n"),
  );
  await writeFile(join(consumerDir, "src/tabs.ts"), createTabSource());
  await writeFile(
    join(consumerDir, "vite.config.ts"),
    [
      'import { defineConfig } from "vite";',
      "",
      "export default defineConfig({",
      '  build: { rollupOptions: { input: { main: "index.html", tabs: "tabs.html" } } },',
      "});",
      "",
    ].join("\n"),
  );
}

function createBrowserSource() {
  return `import {
  createBroadcastWorkerTransport,
  createWorkerApp,
  createWorkerClient,
  defineModule,
  type AsyncMethodProxy,
  type WorkerAppHost,
  type WorkerClient,
} from "@coexist/core";

interface BroadcastCounterApi {
  increase(step?: number): number;
  reset(): number;
}

interface BroadcastCounterState {
  readonly broadcastCounter: {
    readonly count: number;
  };
}

type BroadcastSnapshot = {
  readonly clientOneCount: number;
  readonly clientOneVersion: number;
  readonly clientOneWatches: readonly number[];
  readonly clientTwoCount: number;
  readonly clientTwoVersion: number;
  readonly clientTwoWatches: readonly number[];
};

declare global {
  interface Window {
    __coexistBroadcastWorkerSmoke?: {
      readonly ready: Promise<void>;
      increaseFromClientOne(step?: number): Promise<BroadcastSnapshot>;
      increaseFromClientTwo(step?: number): Promise<BroadcastSnapshot>;
      read(): BroadcastSnapshot;
      reset(): Promise<BroadcastSnapshot>;
    };
  }
}

class BroadcastCounter {
  count = 0;

  increase(step = 1): number {
    this.count += step;
    return this.count;
  }

  reset(): number {
    this.count = 0;
    return this.count;
  }
}

defineModule(BroadcastCounter, {
  actions: ["increase", "reset"],
  name: "broadcastCounter",
  state: ["count"],
});

const channelName = \`coexist-broadcast-worker-browser-smoke-\${crypto.randomUUID()}\`;
const hostChannel = new BroadcastChannel(channelName);
const clientOneChannel = new BroadcastChannel(channelName);
const clientTwoChannel = new BroadcastChannel(channelName);
const clientOne = createBroadcastClient(clientOneChannel, "client:one");
const clientTwo = createBroadcastClient(clientTwoChannel, "client:two");
const host = createWorkerApp({
  providers: [BroadcastCounter],
  sync: "patch",
  transport: createBroadcastWorkerTransport(hostChannel, {
    peerId: "host",
  }),
});
const clientOneCounter: AsyncMethodProxy<BroadcastCounterApi> =
  clientOne.module<BroadcastCounterApi>("broadcastCounter");
const clientTwoCounter: AsyncMethodProxy<BroadcastCounterApi> =
  clientTwo.module<BroadcastCounterApi>("broadcastCounter");
const clientOneWatches: number[] = [];
const clientTwoWatches: number[] = [];
const selectCount = (state: unknown): number => (state as BroadcastCounterState).broadcastCounter.count;
let unsubscribeClientOne = (): void => {};
let unsubscribeClientTwo = (): void => {};

const ready = start();

window.__coexistBroadcastWorkerSmoke = {
  ready,
  increaseFromClientOne,
  increaseFromClientTwo,
  read,
  reset,
};

getElement<HTMLButtonElement>("increase-one").addEventListener("click", () => {
  void runButtonAction(() => increaseFromClientOne(1));
});
getElement<HTMLButtonElement>("increase-two").addEventListener("click", () => {
  void runButtonAction(() => increaseFromClientTwo(1));
});
window.addEventListener("beforeunload", () => {
  void dispose();
});

render("starting");

async function start(): Promise<void> {
  await Promise.all([clientOne.ready, clientTwo.ready, host.ready]);

  unsubscribeClientOne = clientOne.watch(selectCount, (value) => {
    clientOneWatches.push(value);
    render("ready");
  });
  unsubscribeClientTwo = clientTwo.watch(selectCount, (value) => {
    clientTwoWatches.push(value);
    render("ready");
  });
  render("ready");
}

async function increaseFromClientOne(step = 1): Promise<BroadcastSnapshot> {
  await ready;
  const result = await clientOneCounter.increase(step);
  await waitForBothClients(result);
  render("ready");
  return read();
}

async function increaseFromClientTwo(step = 1): Promise<BroadcastSnapshot> {
  await ready;
  const result = await clientTwoCounter.increase(step);
  await waitForBothClients(result);
  render("ready");
  return read();
}

async function reset(): Promise<BroadcastSnapshot> {
  await ready;
  const result = await clientOneCounter.reset();
  await waitForBothClients(result);
  render("ready");
  return read();
}

function read(): BroadcastSnapshot {
  return {
    clientOneCount: clientOne.select(selectCount),
    clientOneVersion: clientOne.state.version,
    clientOneWatches: [...clientOneWatches],
    clientTwoCount: clientTwo.select(selectCount),
    clientTwoVersion: clientTwo.state.version,
    clientTwoWatches: [...clientTwoWatches],
  };
}

async function waitForBothClients(expected: number): Promise<void> {
  const deadline = Date.now() + 2_000;

  while (Date.now() < deadline) {
    const snapshot = read();

    if (snapshot.clientOneCount === expected && snapshot.clientTwoCount === expected) {
      return;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 10);
    });
  }

  throw new Error(\`Timed out waiting for broadcast clients to reach \${expected}.\`);
}

async function runButtonAction(action: () => Promise<BroadcastSnapshot>): Promise<void> {
  await action();
}

async function dispose(): Promise<void> {
  unsubscribeClientOne();
  unsubscribeClientTwo();
  clientOne.dispose();
  clientTwo.dispose();
  await host.dispose();
  hostChannel.close();
  clientOneChannel.close();
  clientTwoChannel.close();
}

function render(status: string): void {
  const snapshot = clientOne.state.version === 0 || clientTwo.state.version === 0 ? undefined : read();

  getElement("status").textContent = status;
  getElement("client-one-count").textContent = String(snapshot?.clientOneCount ?? 0);
  getElement("client-two-count").textContent = String(snapshot?.clientTwoCount ?? 0);
  getElement("client-one-version").textContent = String(snapshot?.clientOneVersion ?? 0);
  getElement("client-two-version").textContent = String(snapshot?.clientTwoVersion ?? 0);
  getElement("client-one-watches").textContent = JSON.stringify(snapshot?.clientOneWatches ?? []);
  getElement("client-two-watches").textContent = JSON.stringify(snapshot?.clientTwoWatches ?? []);
}

function createBroadcastClient(channel: BroadcastChannel, peerId: string): WorkerClient {
  return createWorkerClient({
    transport: createBroadcastWorkerTransport(channel, {
      peerId,
      targetPeerId: "host",
    }),
  });
}

function getElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (element === null) {
    throw new Error(\`Missing element #\${id}.\`);
  }

  return element as T;
}
`;
}

function createTabSource() {
  return `import {
  createBroadcastWorkerTransport,
  createWorkerApp,
  createWorkerClient,
  defineModule,
} from "@coexist/core";

interface TabCounterApi {
  increase(step?: number): number;
}

interface TabCounterState {
  readonly tabCounter: {
    readonly count: number;
  };
}

declare global {
  interface Window {
    __coexistBroadcastTabSmoke?: {
      readonly ready: Promise<void>;
      count(): number;
      increase(step?: number): Promise<number>;
    };
  }
}

class TabCounter {
  count = 0;

  increase(step = 1): number {
    this.count += step;
    return this.count;
  }
}

defineModule(TabCounter, {
  actions: ["increase"],
  name: "tabCounter",
  state: ["count"],
});

const params = new URLSearchParams(location.search);
const channel = new BroadcastChannel(params.get("channel") ?? "coexist-broadcast-tab-smoke");
// Every tab leaves peerId to its default. Each tab's first transport used to be
// "peer:1", so a host tab and a client tab dropped each other's traffic.
const transport = createBroadcastWorkerTransport(channel);
const selectCount = (state: unknown): number => (state as TabCounterState).tabCounter.count;

if (params.get("role") === "host") {
  const host = createWorkerApp({ providers: [TabCounter], sync: "patch", transport });

  window.__coexistBroadcastTabSmoke = {
    ready: host.ready,
    count: () => host.app.getModule(TabCounter).count,
    increase: async (step = 1) => host.app.getModule(TabCounter).increase(step),
  };
} else {
  const client = createWorkerClient({ readyTimeout: 5_000, transport });

  window.__coexistBroadcastTabSmoke = {
    ready: client.ready,
    count: () => client.select(selectCount),
    increase: async (step = 1) => await client.module<TabCounterApi>("tabCounter").increase(step),
  };
}
`;
}

async function runBroadcastWorkerSmoke(browserInstance, url) {
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
    await page.evaluate(() => window.__coexistBroadcastWorkerSmoke?.ready);
    await expectText(page, "h1", "Broadcast worker browser smoke");
    await expectStat(page, "Status", "ready");

    const initial = await readSmokeSnapshot(page);
    assertSnapshot(initial, {
      clientOneCount: 0,
      clientOneVersion: 0,
      clientTwoCount: 0,
      clientTwoVersion: 0,
    });

    const afterClientOne = await callSmoke(page, "increaseFromClientOne", 2);

    assertSnapshot(afterClientOne, {
      clientOneCount: 2,
      clientTwoCount: 2,
    });
    assertAtLeast(afterClientOne.clientOneVersion, 1, "client one version after first action");
    assertAtLeast(afterClientOne.clientTwoVersion, 1, "client two version after first action");
    assertIncludes(afterClientOne.clientOneWatches, 2, "client one watch values");
    assertIncludes(afterClientOne.clientTwoWatches, 2, "client two watch values");
    await expectStat(page, "Client one count", "2");
    await expectStat(page, "Client two count", "2");

    const afterClientTwo = await callSmoke(page, "increaseFromClientTwo", 5);

    assertSnapshot(afterClientTwo, {
      clientOneCount: 7,
      clientTwoCount: 7,
    });
    assertAtLeast(afterClientTwo.clientOneVersion, 2, "client one version after second action");
    assertAtLeast(afterClientTwo.clientTwoVersion, 2, "client two version after second action");
    assertIncludes(afterClientTwo.clientOneWatches, 7, "client one watch values");
    assertIncludes(afterClientTwo.clientTwoWatches, 7, "client two watch values");
    await expectStat(page, "Client one count", "7");
    await expectStat(page, "Client two count", "7");

    const afterReset = await callSmoke(page, "reset");

    assertSnapshot(afterReset, {
      clientOneCount: 0,
      clientTwoCount: 0,
    });
    assertIncludes(afterReset.clientOneWatches, 0, "client one watch values after reset");
    assertIncludes(afterReset.clientTwoWatches, 0, "client two watch values after reset");
    await expectStat(page, "Client one count", "0");
    await expectStat(page, "Client two count", "0");

    if (errors.length > 0) {
      throw new Error(
        `Installed broadcast worker smoke emitted browser errors:\n${errors.join("\n")}`,
      );
    }
  } finally {
    await context.close();
  }
}

async function runBroadcastTabSmoke(browserInstance, url) {
  // Tabs of one browser context share BroadcastChannel but not a module realm:
  // default peer ids that collide across realms, and clients that must follow a
  // host whose tab closed, only show up across real tabs.
  const context = await browserInstance.newContext();
  const channel = `coexist-broadcast-tab-smoke-${Date.now()}`;
  const errors = [];

  const openTab = async (role) => {
    const page = await context.newPage();

    page.on("pageerror", (error) => {
      errors.push(error.stack ?? error.message);
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    await page.goto(new URL(`tabs.html?role=${role}&channel=${channel}`, url).href, {
      waitUntil: "networkidle",
    });
    await page.evaluate(() => window.__coexistBroadcastTabSmoke?.ready);

    return page;
  };

  try {
    const hostTab = await openTab("host");
    const clientTab = await openTab("client");

    expectTabValue(await callTab(clientTab, "increase", 3), 3, "a call between default peer ids");
    await waitForTabCount(hostTab, 3, "the host tab");
    await waitForTabCount(clientTab, 3, "the client tab");

    await hostTab.close();
    await openTab("host");

    await waitForTabCount(clientTab, 0, "the client tab after its host was replaced");
    expectTabValue(await callTab(clientTab, "increase", 2), 2, "a call to the replacement host");
    await waitForTabCount(clientTab, 2, "the client tab on the replacement host");

    if (errors.length > 0) {
      throw new Error(
        `Installed broadcast tab smoke emitted browser errors:\n${errors.join("\n")}`,
      );
    }
  } finally {
    await context.close();
  }
}

async function callTab(page, method, ...args) {
  return await page.evaluate(
    async ({ callArgs, methodName }) => {
      const smoke = window.__coexistBroadcastTabSmoke;

      if (smoke === undefined) {
        throw new Error("Broadcast tab smoke API was not registered.");
      }

      return await smoke[methodName](...callArgs);
    },
    { callArgs: args, methodName: method },
  );
}

async function waitForTabCount(page, expected, label) {
  try {
    await page.waitForFunction(
      (value) => window.__coexistBroadcastTabSmoke?.count() === value,
      expected,
      { timeout: 5_000 },
    );
  } catch (error) {
    throw new Error(`The count in ${label} never reached ${expected}.`, { cause: error });
  }
}

function expectTabValue(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} expected ${expected}, got ${JSON.stringify(actual)}.`);
  }
}

async function readSmokeSnapshot(page) {
  return await page.evaluate(() => {
    const smoke = window.__coexistBroadcastWorkerSmoke;

    if (smoke === undefined) {
      throw new Error("Broadcast worker smoke API was not registered.");
    }

    return smoke.read();
  });
}

async function callSmoke(page, method, ...args) {
  return await page.evaluate(
    async ({ callArgs, methodName }) => {
      const smoke = window.__coexistBroadcastWorkerSmoke;

      if (smoke === undefined) {
        throw new Error("Broadcast worker smoke API was not registered.");
      }

      const action = smoke[methodName];

      if (typeof action !== "function") {
        throw new Error(`Broadcast worker smoke method ${methodName} is missing.`);
      }

      return await action(...callArgs);
    },
    { callArgs: args, methodName: method },
  );
}

function assertSnapshot(actual, expected) {
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) {
      throw new Error(
        `Expected snapshot.${key} to be ${JSON.stringify(value)}, got ${JSON.stringify(
          actual[key],
        )}. Snapshot: ${JSON.stringify(actual)}`,
      );
    }
  }
}

function assertIncludes(values, expected, label) {
  if (!values.includes(expected)) {
    throw new Error(`${label} must include ${JSON.stringify(expected)}: ${JSON.stringify(values)}`);
  }
}

function assertAtLeast(value, minimum, label) {
  if (value < minimum) {
    throw new Error(`${label} must be at least ${minimum}, got ${value}.`);
  }
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
        "Unable to launch Chromium for installed broadcast worker browser smoke.",
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

async function expectText(page, selector, expected) {
  await page.waitForFunction(
    ({ selector: cssSelector, expectedText }) => {
      const element = document.querySelector(cssSelector);
      return element?.textContent?.includes(expectedText) ?? false;
    },
    { expectedText: expected, selector },
  );
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

function contentType(filePath) {
  switch (extname(filePath)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
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
    throw new Error(`Missing built broadcast worker smoke asset: ${path}`);
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
