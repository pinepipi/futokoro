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
  "guide.html",
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

// CSP 文字列を { directive名: [source, ...] } にパースする。
// 例: "default-src 'self'; script-src 'self' https://x" →
//     { "default-src": ["'self'"], "script-src": ["'self'", "https://x"] }
function parseCsp(cspValue) {
  const directives = {};
  for (const segment of cspValue.split(";")) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const [name, ...sources] = tokens;
    directives[name.toLowerCase()] = sources;
  }
  return directives;
}

// _headers の「ルート行 → 直後の Content-Security-Policy 行」から CSP 値を取り出す。
function cspForRoute(lines, route) {
  const idx = lines.findIndex((line) => line.trim() === route);
  if (idx < 0) return null;
  const cspLine = lines[idx + 1] || "";
  const m = cspLine.match(/Content-Security-Policy:\s*(.+)$/i);
  return m ? m[1].trim() : null;
}

test("計算ページCSPはCWAビーコンを正しいディレクティブで許可しつつ unsafe-inline/unsafe-eval を一切含まない（ビーコンCSP固定・将来の弱体化防止）", async () => {
  const headers = await fs.readFile(path.join(distDir, "_headers"), "utf8");
  const lines = headers.split(/\r?\n/);

  // どの CSP 行にも unsafe-inline / unsafe-eval が無いこと
  const cspLines = lines.filter((line) => /Content-Security-Policy:/i.test(line));
  assert.ok(cspLines.length > 0, "_headers に CSP 行が見つからない");
  for (const line of cspLines) {
    assert.ok(!line.includes("'unsafe-inline'"), `CSP に 'unsafe-inline' が混入: ${line.trim()}`);
    assert.ok(!line.includes("'unsafe-eval'"), `CSP に 'unsafe-eval' が混入: ${line.trim()}`);
  }

  // 計算ページの両ルート（/ と /index.html）でディレクティブ単位に検証する。
  // 単純な文字列包含では「間違ったディレクティブに載っていても通る」ため、必ずパースして判定。
  for (const route of ["/", "/index.html"]) {
    const cspValue = cspForRoute(lines, route);
    assert.ok(cspValue, `${route} の直後に CSP 行が無い`);
    const directives = parseCsp(cspValue);

    assert.ok(
      (directives["script-src"] || []).includes("https://static.cloudflareinsights.com"),
      `${route} の script-src に CWA ビーコン(static.cloudflareinsights.com)が無い`
    );
    assert.ok(
      (directives["connect-src"] || []).includes("https://cloudflareinsights.com"),
      `${route} の connect-src に CWA 収集先(cloudflareinsights.com)が無い`
    );
    assert.ok(
      (directives["connect-src"] || []).includes("'self'"),
      `${route} の connect-src に 'self' が無い（プロキシ経由の同一オリジン /cdn-cgi/rum への堅牢化）`
    );
  }
});

test("CWA beacon は意図した公開HTMLページだけに1回ずつ注入される（注入対象の固定・拡散/欠落の防止）", async () => {
  // publish.test.js は npm run test:publish 経由でビルド後（dist 生成後）に実行される。
  const BEACON = "static.cloudflareinsights.com/beacon.min.js";
  const expectedBeaconPages = ["index.html", "about.html", "guide.html", "privacy.html", "feedback.html"].sort();

  const files = await listFiles(distDir);
  const withBeacon = [];
  for (const rel of files) {
    const content = await fs.readFile(path.join(distDir, rel), "utf8");
    const occurrences = content.split(BEACON).length - 1;
    if (occurrences > 0) {
      withBeacon.push(rel);
      // 各対象ページに1回だけ（二重注入なし）
      assert.equal(occurrences, 1, `${rel} に beacon が ${occurrences} 回注入されている（1回であるべき）`);
    }
  }

  // beacon を含むファイル集合が、意図した公開HTMLページと完全一致すること
  assert.deepEqual(
    withBeacon.sort(),
    expectedBeaconPages,
    "CWA beacon の注入対象が意図した公開HTMLページ集合と一致しない（拡散または欠落）"
  );
});

test("各公開HTMLページに _headers の CSP がある（CSP漏れの再発防止）", async () => {
  const headers = await fs.readFile(path.join(distDir, "_headers"), "utf8");
  const lines = headers.split(/\r?\n/);
  // ルート行の直後行に Content-Security-Policy があるルート集合
  const cspRoutes = new Set();
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (/^\/\S*\s*$/.test(lines[i]) && /Content-Security-Policy:/i.test(lines[i + 1])) {
      cspRoutes.add(lines[i].trim());
    }
  }
  const htmlFiles = (await listFiles(distDir)).filter((f) => f.endsWith(".html") && !f.includes("/"));
  for (const f of htmlFiles) {
    const full = `/${f}`;                                   // 例: /about.html
    const norm = f === "index.html" ? "/" : `/${f.replace(/\.html$/, "")}`; // 例: /about（index は /）
    assert.ok(cspRoutes.has(full), `${full} に CSP が無い（_headers にHTMLページごとのCSP指定が必要）`);
    assert.ok(cspRoutes.has(norm), `${norm} に CSP が無い（Cloudflareの /xxx 正規化経路にもCSPが必要）`);
  }
});
