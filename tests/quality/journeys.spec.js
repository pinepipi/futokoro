// 主要ユーザー導線 E2E（desktop / mobile 両 project で実行）
// UI_ACCEPTANCE.md の必須導線を、画面崩れ・console/network 監視つきで検証する。
const { test, expect } = require("@playwright/test");
const { openApp, fillBasics, switchTab } = require("./helpers/app");
const { checkLayout } = require("./helpers/layout-check");
const { attachConsoleNetwork, toIssues } = require("./helpers/console-network");

// 各テストの崩れ assertion（P0/P1 が出たら fail）
async function expectNoLayoutDefects(page, label) {
  const issues = (await checkLayout(page)).filter((i) => i.severity === "P0" || i.severity === "P1");
  expect(issues, `${label} に画面崩れ: ${JSON.stringify(issues, null, 2)}`).toEqual([]);
}

test.describe("ふところ 主要導線", () => {
  let collected;

  test.beforeEach(async ({ page }) => {
    collected = attachConsoleNetwork(page);
    await openApp(page);
  });

  test.afterEach(async () => {
    const blocking = toIssues(collected).filter((i) => i.severity === "P0" || i.severity === "P1");
    expect(blocking, `console/network に致命的 issue: ${JSON.stringify(blocking, null, 2)}`).toEqual([]);
  });

  test("初回表示は空状態の案内と例ボタンが見える", async ({ page }) => {
    await expect(page.locator("#monthsBadge")).toHaveText(/--/);
    await expect(page.locator("#sampleButton")).toBeVisible();
    await expect(page.locator(".trust-strip")).toBeVisible();
    await expectNoLayoutDefects(page, "初回(空状態)");
  });

  test("例を入れるで試算が立ち上がる", async ({ page }) => {
    await page.click("#sampleButton");
    await expect(page.locator("#monthsBadge")).not.toHaveText(/^--/);
    await expect(page.locator("#rulerReadout")).not.toHaveText("--");
    await expectNoLayoutDefects(page, "サンプル投入後");
  });

  test("例を入れて試すで大きな出費が試算に反映され付箋に見える", async ({ page }) => {
    await page.click("#sampleButton");
    // 見本は大きな出費を1件注入する（入力モーダルは自動で開かない）
    await expect(page.locator('.month-field[data-kind="extraExpense"][data-index="3"]')).toHaveValue("500,000");
    // 付箋に「大きな出費」イベントが出る＝見本が機能している
    await switchTab(page, "notes");
    await expect(
      page.locator("#monthNotes .note-event.outgoing", { hasText: "大きな出費" }).first()
    ).toBeVisible();
    await expectNoLayoutDefects(page, "サンプル投入(大きな出費表示)");
  });

  test("付箋タブの底の月に「最小」バッジが1つだけ付く（色覚非依存）", async ({ page }) => {
    await fillBasics(page);
    await switchTab(page, "notes");
    const badges = page.locator("#monthNotes .note-min-badge");
    await expect(badges).toHaveCount(1);
    await expect(badges.first()).toHaveText("最小");
    // バッジは色強調(.lowest)と同じ底の月カードに乗る
    await expect(page.locator("#monthNotes .month-note.lowest .note-min-badge")).toHaveCount(1);
    await expectNoLayoutDefects(page, "付箋タブ(最小バッジ)");
  });

  test("3つ入力するとヒーロー月数と主要指標が確定する", async ({ page }) => {
    await fillBasics(page);
    await expect(page.locator("#monthsBadge")).not.toHaveText(/^--/);
    await expect(page.locator("#lowestMonth")).not.toHaveText("--");
    await expect(page.locator("#endingBalance")).not.toHaveText("--円");
    // INC-FUT-20260607-UI 再発防止: 「ヶ月分」と数字が分離していない
    await expect(page.locator("#monthsBadge")).toContainText("ヶ月分");
    await expectNoLayoutDefects(page, "3項目入力後(まとめ)");
  });

  test("4タブすべてが切替でき中身が出る", async ({ page }) => {
    await fillBasics(page);

    await switchTab(page, "notes");
    await expect(page.locator("#view-notes .note-legend")).toBeVisible();
    await expect(page.locator("#monthNotes .month-note").first()).toBeVisible();
    await expectNoLayoutDefects(page, "付箋タブ");

    await switchTab(page, "chart");
    await expect(page.locator("#balanceChart")).toBeVisible();
    await expectNoLayoutDefects(page, "残高グラフタブ");

    await switchTab(page, "table");
    await expect(page.locator("#projectionRows tr").first()).toBeVisible();
    await expectNoLayoutDefects(page, "金額表タブ");

    await switchTab(page, "now");
    await expect(page.locator("#view-now")).toBeVisible();
  });

  test("これ買える？が判定と理由を返す", async ({ page }) => {
    await fillBasics(page);
    await page.fill("#buyAmount", "120000");
    // buyWhen は JS で options 生成。option は閉じた select 内で hidden 扱いのため count で待つ
    await expect(page.locator("#buyWhen option")).not.toHaveCount(0);
    await page.selectOption("#buyWhen", { index: 0 });
    await page.click("#buyCheckButton");
    await expect(page.locator("#buyResult")).toBeVisible();
    await expect(page.locator("#buyVerdict")).not.toHaveText("");
    await expect(page.locator("#buyReason")).not.toHaveText("");
    await expectNoLayoutDefects(page, "これ買える?判定後");
  });

  test("記録の保存・読み込みUIが見え、JSON読込で復元される", async ({ page }) => {
    await expect(page.locator("#exportJsonButton")).toBeVisible();
    await expect(page.locator("#exportCsvButton")).toBeVisible();
    const json = JSON.stringify({
      app: "futokoro",
      schemaVersion: 1,
      input: { currentCash: 1500000, monthlyIncome: 400000, monthlyExpense: 250000, months: [] }
    });
    await page.setInputFiles("#importJsonInput", {
      name: "futokoro.json",
      mimeType: "application/json",
      buffer: Buffer.from(json, "utf8")
    });
    await expect(page.locator("#currentCash")).toHaveValue("1,500,000");
    await expect(page.locator("#monthsBadge")).not.toHaveText(/^--/);
    await expect(page.locator("#ioMessage")).toContainText("復元");
    await expectNoLayoutDefects(page, "JSON読込後");
  });

  test("入力クリアで空状態に戻る", async ({ page }) => {
    await fillBasics(page);
    await expect(page.locator("#monthsBadge")).not.toHaveText(/^--/);
    await page.click("#resetButton"); // dialog は openApp で自動承認
    await expect(page.locator("#monthsBadge")).toHaveText(/--/);
    await expect(page.locator("#lowestMonth")).toHaveText("--");
    await expectNoLayoutDefects(page, "リセット後");
  });
});
