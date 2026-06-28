const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const expectedFiles = [
  "_headers",
  "about.html",
  "ads-config.js",
  "ads.js",
  "app.js",
  "benchmark.js",
  "domain.js",
  "favicon.svg",
  "feedback.html",
  "feedback.js",
  "functions/api/feedback.js",
  "index.html",
  "io.js",
  "privacy.html",
  "styles.css"
].sort();
const forbiddenDirectories = [
  "coverage",
  "docs",
  "node_modules",
  "ops",
  "output",
  "playwright-report",
  "screenshots",
  "test-results",
  "tests",
  "trace"
];

async function listFiles(dir, prefix = "") {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath, relative));
    } else {
      files.push(relative.replaceAll(path.sep, "/"));
    }
  }

  return files.sort();
}

test("dist contains only public runtime files", async () => {
  const files = await listFiles(distDir);
  assert.deepEqual(files, expectedFiles);
});

test("dist excludes internal docs, ops, tests, and QA artifacts", async () => {
  const files = await listFiles(distDir);
  const joined = files.join("\n");
  for (const directory of forbiddenDirectories) {
    assert.equal(new RegExp(`(^|/)${directory}/`).test(joined), false, `${directory}/ must not be published`);
  }
  assert.equal(files.includes("AGENTS.md"), false);
  assert.equal(files.includes("README.md"), false);
  assert.equal(files.includes("e2e.config.json"), false);
  assert.equal(files.includes("package.json"), false);
  assert.equal(files.includes("playwright.config.js"), false);
});

test("ad config requires readiness gates before enabling external ads", async () => {
  const source = await fs.readFile(path.join(distDir, "ads-config.js"), "utf8");
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(source, context);

  assert.equal(context.window.FutokoroAds.enabled, false);
  assert.equal(context.window.FutokoroAds.readiness.csp, false);
  assert.equal(context.window.FutokoroAds.readiness.privacy, false);

  const adsSource = await fs.readFile(path.join(distDir, "ads.js"), "utf8");
  assert.match(adsSource, /readiness\.csp === true/);
  assert.match(adsSource, /readiness\.privacy === true/);
});
