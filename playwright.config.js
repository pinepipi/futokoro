// Playwright 設定 — ふところ UI品質ゲート
// 静的サイトを file:// で開く（Webサーバー不要）。導線/視覚/a11y を desktop・mobile で検証する。
// 既存の standalone smoke（tests/smoke.playwright.js）とは別レイヤー（こちらは playwright test ランナー）。
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/quality",
  // スクショ baseline は __screenshots__/<project>/<file>/<name> に集約してコミットする
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "output/quality/playwright-results.json" }],
  ],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  expect: {
    toHaveScreenshot: {
      // アンチエイリアス/フォントの微差を吸収。実害ある崩れは layout-check が別途検出する。
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
      caret: "hide",
    },
  },
  projects: [
    // スクショ決定論のため device emulation は使わず viewport を固定（deviceScaleFactor=1）
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } },
    },
  ],
});
