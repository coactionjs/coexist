#!/usr/bin/env node
import { createServer } from "node:http";
import { accessSync, constants } from "node:fs";
import { cp, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

import {
  createPackPackage,
  lockfilePath,
  packagesDir,
  readCatalog,
  rootDir,
  run,
} from "./lib/smoke.ts";

const rootPackagePath = join(rootDir, "package.json");
const sourceExampleDir = join(rootDir, "examples", "worker-counter");
const tempDir = await mkdtemp(join(tmpdir(), "coexist-installed-worker-runtime-"));
const exampleDir = join(tempDir, "examples", "worker-counter");
const tarballsDir = join(tempDir, "tarballs");
const packPackage = createPackPackage(tarballsDir);
const chromeExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? findSystemChrome();

let browser;
let server;

try {
  const catalog = await readCatalog();
  const rootPackageJson = JSON.parse(await readFile(rootPackagePath, "utf8"));
  const coreTarball = await packPackage("@coexist/core");

  await writeInstalledWorkerExample(coreTarball, catalog, rootPackageJson);
  await run("pnpm", ["install", "--prefer-offline", "--no-frozen-lockfile"], tempDir);
  await run("pnpm", ["--filter", "@coexist/example-worker-counter", "run", "typecheck"], tempDir);
  await run("pnpm", ["--filter", "@coexist/example-worker-counter", "run", "build"], tempDir);

  server = await createStaticServer(join(exampleDir, "dist"));
  browser = await launchBrowser();

  await runWorkerSmoke(browser, server.url);

  console.log("Verified installed @coexist/core Web Worker runtime.");
} finally {
  await browser?.close();
  await server?.close();
  await rm(tempDir, { force: true, recursive: true });
}

async function writeInstalledWorkerExample(coreTarball, catalog, rootPackageJson) {
  await mkdir(join(tempDir, "examples"), { recursive: true });
  await mkdir(join(tempDir, "packages"), { recursive: true });
  await cp(join(packagesDir, "tsconfig"), join(tempDir, "packages", "tsconfig"), {
    recursive: true,
  });
  await cp(sourceExampleDir, exampleDir, {
    filter(source) {
      const name = basename(source);
      return name !== "dist" && name !== "node_modules" && name !== ".turbo";
    },
    recursive: true,
  });

  const packageJson = JSON.parse(await readFile(join(sourceExampleDir, "package.json"), "utf8"));

  await writeFile(
    join(exampleDir, "package.json"),
    `${JSON.stringify(
      {
        ...packageJson,
        dependencies: {
          ...rewriteDependencyField(packageJson.dependencies, catalog),
          "@coexist/core": `file:${coreTarball}`,
        },
        devDependencies: rewriteDependencyField(packageJson.devDependencies, catalog),
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(tempDir, "package.json"),
    `${JSON.stringify(
      {
        name: "coexist-installed-worker-runtime-smoke",
        packageManager: rootPackageJson.packageManager,
        private: true,
        type: "module",
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(join(tempDir, "pnpm-lock.yaml"), await readFile(lockfilePath, "utf8"));
  await writeFile(
    join(tempDir, "pnpm-workspace.yaml"),
    [
      "minimumReleaseAgeExclude:",
      `  - ${JSON.stringify(`coaction@${readCatalogVersion(catalog, "coaction")}`)}`,
      "packages:",
      '  - "examples/*"',
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
}

function rewriteDependencyField(dependencies, catalog) {
  if (dependencies === undefined) {
    return undefined;
  }

  const rewritten = {};

  for (const [name, range] of Object.entries(dependencies)) {
    rewritten[name] = range === "catalog:" ? readCatalogVersion(catalog, name) : range;
  }

  return rewritten;
}

async function runWorkerSmoke(browserInstance, url) {
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
    await expectText(page, "h1", "Worker counter");
    await expectText(page, "p", "running in a Vite Web Worker");
    await expectButtonEnabled(page, "Increase in worker");

    await clickButton(page, "Increase in worker");
    await expectStat(page, "Count", "1");
    await expectStat(page, "Double", "2");

    await clickButton(page, "Increase in worker");
    await expectStat(page, "Count", "2");
    await expectStat(page, "Double", "4");

    await clickButton(page, "Reset");
    await expectStat(page, "Count", "0");
    await expectStat(page, "Double", "0");

    if (errors.length > 0) {
      throw new Error(`Installed worker runtime emitted browser errors:\n${errors.join("\n")}`);
    }
  } finally {
    await context.close();
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
        "Unable to launch Chromium for installed worker runtime smoke.",
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

async function clickButton(page, label) {
  await page.getByRole("button", { name: label }).click();
}

async function expectButtonEnabled(page, label) {
  await page.getByRole("button", { name: label }).waitFor({ state: "visible" });
  await page.waitForFunction((buttonLabel) => {
    const button = [...document.querySelectorAll("button")].find(
      (element) => element.textContent?.trim() === buttonLabel,
    );
    return button !== undefined && !button.disabled;
  }, label);
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
    throw new Error(`Missing built worker runtime asset: ${path}`);
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
