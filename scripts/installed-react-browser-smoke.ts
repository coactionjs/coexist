#!/usr/bin/env node
/* eslint-disable no-underscore-dangle */
import { createServer } from "node:http";
import { accessSync, constants } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

import { createPackPackage, lockfilePath, readCatalog, run } from "./lib/smoke.ts";

const tempDir = await mkdtemp(join(tmpdir(), "coexist-react-browser-"));
const tarballsDir = join(tempDir, "tarballs");
const packPackage = createPackPackage(tarballsDir);
const consumerDir = join(tempDir, "consumer");
const chromeExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? findSystemChrome();

let browser;
let server;

try {
  const catalog = await readCatalog();
  const coreTarball = await packPackage("@coexist/core");
  const reactTarball = await packPackage("@coexist/react");

  await writeConsumerProject(coreTarball, reactTarball, catalog);
  await run("pnpm", ["install", "--prefer-offline", "--no-frozen-lockfile"], consumerDir);
  await run("pnpm", ["run", "typecheck"], consumerDir);
  await run("pnpm", ["run", "build"], consumerDir);

  server = await createStaticServer(join(consumerDir, "dist"));
  browser = await launchBrowser();

  await runReactBrowserSmoke(browser, server.url);

  console.log("Verified installed React adapter browser DOM integration.");
} finally {
  await browser?.close();
  await server?.close();
  await rm(tempDir, { force: true, recursive: true });
}

async function writeConsumerProject(coreTarball, reactTarball, catalog) {
  await mkdir(join(consumerDir, "src"), { recursive: true });
  await writeFile(
    join(consumerDir, "package.json"),
    `${JSON.stringify(
      {
        name: "coexist-react-browser-smoke",
        private: true,
        type: "module",
        scripts: {
          build: "vite build --logLevel error",
          typecheck: "tsc -p tsconfig.json --noEmit",
        },
        dependencies: {
          "@coexist/core": `file:${coreTarball}`,
          "@coexist/react": `file:${reactTarball}`,
          coaction: readCatalogVersion(catalog, "coaction"),
          react: readCatalogVersion(catalog, "react"),
          "react-dom": readCatalogVersion(catalog, "react-dom"),
        },
        devDependencies: {
          "@types/react": readCatalogVersion(catalog, "@types/react"),
          "@types/react-dom": readCatalogVersion(catalog, "@types/react-dom"),
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
      `  "@coexist/react": ${JSON.stringify(`file:${reactTarball}`)}`,
      `  "@types/react": ${JSON.stringify(readCatalogVersion(catalog, "@types/react"))}`,
      `  "@types/react-dom": ${JSON.stringify(readCatalogVersion(catalog, "@types/react-dom"))}`,
      `  "coaction": ${JSON.stringify(readCatalogVersion(catalog, "coaction"))}`,
      `  "react": ${JSON.stringify(readCatalogVersion(catalog, "react"))}`,
      `  "react-dom": ${JSON.stringify(readCatalogVersion(catalog, "react-dom"))}`,
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
      "    <title>Coexist React browser smoke</title>",
      "  </head>",
      "  <body>",
      '    <main aria-label="React browser smoke">',
      "      <h1>React browser smoke</h1>",
      '      <div id="root"></div>',
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
  return `import { createElement, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createApp, defineModule, type App } from "@coexist/core";
import { CoexistProvider, useApp, useModule, useSelector } from "@coexist/react";

type SmokeSnapshot = {
  readonly count: number;
  readonly double: number;
  readonly parity: string;
  readonly parityRenders: number;
  readonly phase: string;
  readonly provided: string;
  readonly state: unknown;
  readonly status: string;
};

declare global {
  interface Window {
    __coexistReactSmoke?: {
      readonly app: App;
      dispose(): Promise<void>;
      setByRunInAction(value: number): void;
      snapshot(): SmokeSnapshot;
    };
  }
}

class BrowserCounter {
  count = 0;
  phase = "idle";

  get double(): number {
    return this.count * 2;
  }

  increase(step = 1): number {
    this.count += step;
    this.phase = "sync";
    return this.count;
  }

  async increaseLater(step = 1): Promise<number> {
    this.phase = "pending";
    await Promise.resolve();
    this.count += step;
    this.phase = "done";
    return this.count;
  }
}

defineModule(BrowserCounter, {
  actions: ["increase", "increaseLater"],
  computed: ["double"],
  name: "reactBrowserCounter",
  state: ["count", "phase"],
});

const app = createApp({
  providers: [BrowserCounter],
});
const rootElement = document.querySelector("#root");

if (!(rootElement instanceof HTMLElement)) {
  throw new Error("Missing React root element.");
}

const root = createRoot(rootElement);

root.render(createElement(CoexistProvider, { app }, createElement(SmokeApp)));

window.__coexistReactSmoke = {
  app,
  async dispose() {
    root.unmount();
    await app.dispose();
  },
  setByRunInAction(value) {
    const counter = app.getModule(BrowserCounter);

    app.runInAction(
      BrowserCounter,
      () => {
        counter.count = value;
        counter.phase = "manual";
      },
      {
        name: "browserManual",
      },
    );
  },
  snapshot() {
    return {
      count: app.getModule(BrowserCounter).count,
      double: app.getModule(BrowserCounter).double,
      parity: readText("#parity"),
      parityRenders: Number(readText("#parity-renders")),
      phase: app.getModule(BrowserCounter).phase,
      provided: readText("#provided"),
      state: app.store.getPureState(),
      status: readText("#status"),
    };
  },
};

function SmokeApp() {
  return createElement(
    "section",
    { "aria-label": "React adapter smoke" },
    createElement(CounterView),
    createElement(ParityView),
  );
}

function CounterView() {
  const appFromContext = useApp();
  const counter = useModule(BrowserCounter);
  const count = useSelector(BrowserCounter, (currentCounter) => currentCounter.count);
  const double = useSelector(BrowserCounter, (currentCounter) => currentCounter.double);
  const phase = useSelector((currentApp) => currentApp.getModule(BrowserCounter).phase);
  const [pending, setPending] = useState(false);

  return createElement(
    "section",
    { "aria-label": "Counter" },
    createElement("dl", null,
      createElement("div", null, createElement("dt", null, "Status"), createElement("dd", { id: "status" }, pending ? "pending" : "ready")),
      createElement("div", null, createElement("dt", null, "Provided"), createElement("dd", { id: "provided" }, String(appFromContext === app))),
      createElement("div", null, createElement("dt", null, "Count"), createElement("dd", { id: "count" }, String(count))),
      createElement("div", null, createElement("dt", null, "Double"), createElement("dd", { id: "double" }, String(double))),
      createElement("div", null, createElement("dt", null, "Phase"), createElement("dd", { id: "phase" }, phase)),
    ),
    createElement(
      "button",
      {
        id: "increase-two",
        onClick: () => counter.increase(2),
        type: "button",
      },
      "Increase by 2",
    ),
    createElement(
      "button",
      {
        id: "increase-one",
        onClick: () => counter.increase(1),
        type: "button",
      },
      "Increase by 1",
    ),
    createElement(
      "button",
      {
        id: "increase-async",
        onClick: () => {
          setPending(true);
          void counter.increaseLater(3).finally(() => setPending(false));
        },
        type: "button",
      },
      "Increase async",
    ),
  );
}

function ParityView() {
  const renders = useRef(0);
  const selected = useSelector(
    (currentApp) => ({
      parity: currentApp.getModule(BrowserCounter).count % 2,
    }),
    {
      equals: (value, previous) => value.parity === previous.parity,
    },
  );

  renders.current += 1;

  return createElement(
    "section",
    { "aria-label": "Parity" },
    createElement("span", { id: "parity" }, String(selected.parity)),
    createElement("span", { id: "parity-renders" }, String(renders.current)),
  );
}

function readText(selector: string): string {
  return document.querySelector(selector)?.textContent?.trim() ?? "";
}
`;
}

async function runReactBrowserSmoke(currentBrowser, url) {
  const page = await currentBrowser.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  try {
    await page.goto(url);

    await expectText(page, "#status", "ready");
    await expectText(page, "#provided", "true");
    await expectText(page, "#count", "0");
    await expectText(page, "#double", "0");
    await expectText(page, "#phase", "idle");
    await expectText(page, "#parity", "0");

    const initialParityRenders = await getParityRenders(page);

    await clickButton(page, "Increase by 2");
    await expectText(page, "#count", "2");
    await expectText(page, "#double", "4");
    await expectText(page, "#phase", "sync");
    await expectText(page, "#parity", "0");
    expectEqual(
      await getParityRenders(page),
      initialParityRenders,
      "selector equality skips same-parity render",
    );

    await clickButton(page, "Increase by 1");
    await expectText(page, "#count", "3");
    await expectText(page, "#double", "6");
    await expectText(page, "#parity", "1");
    assertAtLeast(
      await getParityRenders(page),
      initialParityRenders + 1,
      "selector equality renders changed parity",
    );

    await clickButton(page, "Increase async");
    await expectText(page, "#status", "ready");
    await expectText(page, "#count", "6");
    await expectText(page, "#double", "12");
    await expectText(page, "#phase", "done");
    await expectText(page, "#parity", "0");

    await page.evaluate(() => window.__coexistReactSmoke?.setByRunInAction(10));
    await expectText(page, "#count", "10");
    await expectText(page, "#double", "20");
    await expectText(page, "#phase", "manual");

    const snapshot = await page.evaluate(() => window.__coexistReactSmoke?.snapshot());

    expectJsonEqual(
      snapshot,
      {
        count: 10,
        double: 20,
        parity: "0",
        parityRenders: snapshot?.parityRenders,
        phase: "manual",
        provided: "true",
        state: {
          reactBrowserCounter: {
            count: 10,
            phase: "manual",
          },
        },
        status: "ready",
      },
      "final browser snapshot",
    );

    await page.evaluate(() => window.__coexistReactSmoke?.dispose());

    if (consoleErrors.length > 0 || pageErrors.length > 0) {
      throw new Error(
        [
          "React browser smoke emitted browser errors.",
          ...consoleErrors.map((error) => `console: ${error}`),
          ...pageErrors.map((error) => `page: ${error}`),
        ].join("\n"),
      );
    }
  } finally {
    await page.close();
  }
}

async function getParityRenders(page) {
  return Number(await page.locator("#parity-renders").textContent());
}

async function expectText(page, selector, expected) {
  await page.waitForFunction(
    ({ expectedValue, targetSelector }) =>
      document.querySelector(targetSelector)?.textContent?.trim() === expectedValue,
    { expectedValue: expected, targetSelector: selector },
  );
}

async function clickButton(page, label) {
  await page.getByRole("button", { name: label }).click();
}

function expectEqual(actual, expected, label) {
  if (!Object.is(actual, expected)) {
    throw new Error(label + ": expected " + String(expected) + ", got " + String(actual));
  }
}

function assertAtLeast(actual, expected, label) {
  if (actual < expected) {
    throw new Error(label + ": expected at least " + String(expected) + ", got " + String(actual));
  }
}

function expectJsonEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(label + ": expected " + expectedJson + ", got " + actualJson);
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
        "Unable to launch Chromium for React browser smoke.",
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
    throw new Error(`Missing built React browser asset: ${path}`);
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
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ];

  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next well-known browser path.
    }
  }

  return undefined;
}
