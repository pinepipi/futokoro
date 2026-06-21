// AI視覚judge 用の「複合証拠」バンドルを生成する。
// スクショ単体の UX 監査は誤検出が多い（Baymard 2023）ため、
// スクショ + DOMテキスト + ARIA tree + viewport + console + 自動崩れ検出 をまとめて渡す。
//
// 実行: node scripts/collect-ui-evidence.mjs
// 出力: output/quality/evidence/<viewport>-<state>.png / .json と index.json
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "output", "quality", "evidence");

const { openApp, fillBasics, switchTab } = require(path.join(root, "tests/quality/helpers/app.js"));
const { checkLayout } = require(path.join(root, "tests/quality/helpers/layout-check.js"));

function loadChromium() {
  try {
    return require("@playwright/test").chromium;
  } catch {
    try {
      return require("playwright").chromium;
    } catch {
      return require(path.join(root, "..", "ai-dev-studio", "node_modules", "playwright")).chromium;
    }
  }
}

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1366, height: 900 },
];

// AI judge に渡す状態（UI_ACCEPTANCE / VISUAL_STATES 由来）
const STATES = [
  { id: "empty", setup: async () => {}, expected: "初回(未入力)。空状態の案内と『例を入れる』が見え、主要値は -- 表示。" },
  { id: "filled-now", setup: async (page) => { await fillBasics(page); await switchTab(page, "now"); }, expected: "まとめタブ。現金が生活費の何ヶ月分かがヒーロー数字 #monthsBadge で立つ。目標進捗が出る。" },
  { id: "notes", setup: async (page) => { await fillBasics(page); await switchTab(page, "notes"); }, expected: "付箋タブ。12ヶ月の付箋＋色凡例。薄い月が分かる。" },
  { id: "chart", setup: async (page) => { await fillBasics(page); await switchTab(page, "chart"); }, expected: "残高グラフタブ。グラフが枠いっぱい。" },
  { id: "table", setup: async (page) => { await fillBasics(page); await switchTab(page, "table"); }, expected: "金額表タブ。12行。横スクロールなし。" },
];

const chromium = loadChromium();

async function run() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const index = [];

  for (const vp of VIEWPORTS) {
    for (const state of STATES) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await openApp(page);
      await state.setup(page);
      await page.waitForTimeout(150); // レンダ安定

      const base = `${vp.name}-${state.id}`;
      const pngPath = path.join(outDir, `${base}.png`);
      await page.screenshot({ path: pngPath, fullPage: true });

      const ariaTree = await page.locator("main").ariaSnapshot().catch(() => "(aria snapshot unavailable)");
      const domText = (await page.locator("main").innerText().catch(() => "")).slice(0, 4000);
      const layoutIssues = await checkLayout(page);

      const bundle = {
        screen: state.id,
        viewport: `${vp.width}x${vp.height}`,
        expected_purpose: state.expected,
        screenshot: path.relative(root, pngPath).replace(/\\/g, "/"),
        layout_issues: layoutIssues,
        aria_tree: ariaTree,
        dom_text: domText,
        forbidden: ["外部送信(fetch/XHR)", "cookie/localStorage保存", "入力/結果の近くの広告", "投資/保険の助言表現"],
      };
      const jsonPath = path.join(outDir, `${base}.json`);
      await writeFile(jsonPath, JSON.stringify(bundle, null, 2), "utf8");
      index.push({ bundle: path.relative(root, jsonPath).replace(/\\/g, "/"), screenshot: bundle.screenshot, viewport: bundle.viewport, screen: state.id });
      await page.close();
    }
  }

  await writeFile(path.join(outDir, "index.json"), JSON.stringify({ generated_for: "ai-visual-judge", states: index }, null, 2), "utf8");
  await browser.close();
  console.log(`✅ evidence bundles: ${index.length} → ${path.relative(root, outDir)}/`);
}

run().catch((err) => {
  console.error("evidence collection failed:", err);
  process.exit(1);
});
