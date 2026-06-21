// 視覚回帰 — VISUAL_STATES.md の viewport × state を baseline 化する。
// 「見た目が変わった」を検出する層。baseline は __screenshots__/<project>/ にコミットする。
// 意図した変更で差分が出たら `npm run quality:visual:update` で更新（無検証で更新しない）。
const { test, expect } = require("@playwright/test");
const { openApp, fillBasics, switchTab } = require("./helpers/app");

test.describe("ふところ 視覚状態", () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test("empty: 初回(未入力)", async ({ page }) => {
    await expect(page).toHaveScreenshot("state-empty.png", { fullPage: true });
  });

  test("filled-now: まとめタブ", async ({ page }) => {
    await fillBasics(page);
    await switchTab(page, "now");
    await expect(page).toHaveScreenshot("state-filled-now.png", { fullPage: true });
  });

  test("notes: 付箋タブ", async ({ page }) => {
    await fillBasics(page);
    await switchTab(page, "notes");
    await expect(page.locator("#view-notes")).toHaveScreenshot("state-notes.png");
  });

  test("chart: 残高グラフタブ", async ({ page }) => {
    await fillBasics(page);
    await switchTab(page, "chart");
    await expect(page.locator("#view-chart")).toHaveScreenshot("state-chart.png");
  });

  test("table: 金額表タブ", async ({ page }) => {
    await fillBasics(page);
    await switchTab(page, "table");
    await expect(page.locator("#view-table")).toHaveScreenshot("state-table.png");
  });

  test("buy-ok: これ買える?(無理のない額)", async ({ page }) => {
    await fillBasics(page);
    await page.fill("#buyAmount", "30000");
    await page.selectOption("#buyWhen", { index: 0 });
    await page.click("#buyCheckButton");
    await expect(page.locator(".buy-check-panel")).toHaveScreenshot("state-buy-ok.png");
  });

  test("buy-danger: これ買える?(底割れ額)", async ({ page }) => {
    await fillBasics(page);
    await page.fill("#buyAmount", "9999999");
    await page.selectOption("#buyWhen", { index: 0 });
    await page.click("#buyCheckButton");
    await expect(page.locator(".buy-check-panel")).toHaveScreenshot("state-buy-danger.png");
  });
});
