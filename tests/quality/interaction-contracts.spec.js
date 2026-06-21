// Interaction Contract（操作契約）テスト
// ────────────────────────────────────────────────────────────────────────
// 「完成後の画面が正しいか」ではなく「操作の途中でユーザーの意図を裏切らないか」を検証する。
// 静止画スクショ・DOMスナップショット・動機judge では構造的に見えない層をここで守る。
//
// 守る契約（破ったら P1 = ゲート fail）:
//   C1. 入力中（基本3項目の入力途中・blur前）は、次セクション（buy-check）を reveal しない
//   C2. 入力中はフォーカスを奪わない（タイプ中のフィールドに居続ける）
//   C3. 入力中は主要レイアウトを commit しない（body.app-empty が外れない＝右カラムへ動かない）
//   C4. レイアウト commit / buy-check reveal は「基本フィールドの blur」という明示操作の後だけ
//
// 背景: 2026-06-09 の事故。3つ目を入力し始めると buy-check 欄が出現し、そこへフォーカスを
//       移した瞬間に monthlyExpense の blur が発火 → commitLayout → アニメーションが走る、という
//       「途中で出た要素にフォーカスが吸われる」系。fillBasics→applyButton の直線フローでは拾えない。
//       実ユーザーの寄り道（1文字ずつ入力 / 途中で別欄へ）を pressSequentially で再現して検出する。
//
// 注: opacity:0 は Playwright が "hidden" と見なさないため、判定は class / inert / app-empty の
//     決定論的な状態で行う（grid-template-rows:0fr の collapse 高さに依存しない）。
const { test, expect } = require("@playwright/test");
const { openApp } = require("./helpers/app");
const { installUxSentinel, readUxEvents } = require("./helpers/ux-sentinel");
const io = require("../../io.js");
const domain = require("../../domain.js");

const { MONTH_COUNT } = domain;
const SAMPLE = { currentCash: "1200000", monthlyIncome: "380000", monthlyExpense: "280000" };
const BASIC_IDS = ["currentCash", "monthlyIncome", "monthlyExpense"];

// import フロー用の有効な round-trip データ（io 本体で生成 → 解析互換を保証）
function sampleInput() {
  return {
    currentCash: 1200000,
    monthlyIncome: 380000,
    monthlyExpense: 280000,
    months: Array.from({ length: MONTH_COUNT }, (_, i) => ({
      card: 0,
      extraIncome: i === 5 ? 200000 : 0,
      extraExpense: i === 0 ? 80000 : 0,
    })),
  };
}

const hasBodyClass = (page, cls) => page.evaluate((c) => document.body.classList.contains(c), cls);
const isInert = (loc) => loc.evaluate((el) => el.inert === true || el.closest("[inert]") !== null);
const hasClass = (loc, cls) => loc.evaluate((el, c) => el.classList.contains(c), cls);

// 「明示操作 → 空状態から結果表示まで commit される」ことを確認する共通アサート。
// 前回 Codex changes（P1）の回帰: commitLayout 導入で sample/import が空状態から抜けなくなった事故のガード。
async function expectProgressedToResults(page, label) {
  await expect(page.locator("body"), `${label}: layout が commit されず空状態のまま`).not.toHaveClass(/app-empty/);
  await expect(page.locator("#monthsBadge"), `${label}: ヒーロー数字が -- のまま（結果が出ていない）`).not.toHaveText(/^--/);
  const buyCheck = page.locator("#buy-check-section");
  expect(await hasClass(buyCheck, "is-revealed"), `${label}: buy-check が reveal されない`).toBe(true);
  expect(await isInert(buyCheck), `${label}: buy-check が inert のまま`).toBe(false);
}

test.describe("操作契約（入力途中の状態遷移）", () => {
  test.beforeEach(async ({ page }) => {
    await installUxSentinel(page); // goto より前に注入する必要があるため openApp の前
    await openApp(page);
  });

  test("C1-C3: 3つ目を入力している最中は reveal も focus奪取も layout commit も起きない", async ({ page }) => {
    const cash = page.locator("#currentCash");
    const income = page.locator("#monthlyIncome");
    const expense = page.locator("#monthlyExpense");
    const buyCheck = page.locator("#buy-check-section");

    // 1つ目・2つ目を実ユーザーのように1文字ずつ入れる（fill()だと途中状態を飛ばす）
    await cash.focus();
    await cash.pressSequentially(SAMPLE.currentCash, { delay: 15 });
    await income.focus();
    await income.pressSequentially(SAMPLE.monthlyIncome, { delay: 15 });

    // 3つ目を入力中。まだ blur していない＝「入力の途中」
    await expense.focus();
    await expense.pressSequentially(SAMPLE.monthlyExpense, { delay: 15 });

    // C2: フォーカスは3つ目に居続けている（途中で出た要素に奪われていない）
    await expect(expense).toBeFocused();

    // C1: buy-check はまだ reveal されていない（出ると、そこを触った瞬間に blur→commit が走る）
    expect(await hasClass(buyCheck, "is-revealed"), "入力中に buy-check が reveal された").toBe(false);
    expect(await isInert(buyCheck), "入力中に buy-check が操作可能になっている").toBe(true);

    // C3: 主要レイアウトは未 commit（中央のまま・右カラムへ動いていない）
    expect(await hasBodyClass(page, "app-empty"), "入力中に layout が commit された").toBe(true);

    // センチネル: 入力中フェーズに「reveal系の attr変化」「他要素へのfocus移動」が無いこと
    const events = await readUxEvents(page);
    const surpriseReveal = events.filter(
      (e) => e.type === "attr-change" && String(e.target).includes("buy") && String(e.className || "").includes("is-revealed")
    );
    expect(surpriseReveal, `入力中に buy-check が reveal された: ${JSON.stringify(surpriseReveal)}`).toEqual([]);

    const focusStolenAway = events.filter(
      (e) => e.type === "focusin" && !BASIC_IDS.includes(String(e.target))
    );
    expect(focusStolenAway, `入力中にフォーカスが基本3欄の外へ移った: ${JSON.stringify(focusStolenAway)}`).toEqual([]);
  });

  test("C4: 3つ目を blur して初めて layout commit と buy-check reveal が起きる", async ({ page }) => {
    const expense = page.locator("#monthlyExpense");
    const buyCheck = page.locator("#buy-check-section");

    await page.locator("#currentCash").fill(SAMPLE.currentCash);
    await page.locator("#monthlyIncome").fill(SAMPLE.monthlyIncome);
    await expense.focus();
    await expense.pressSequentially(SAMPLE.monthlyExpense, { delay: 15 });

    // blur 前: まだ commit / reveal されていない
    expect(await hasBodyClass(page, "app-empty")).toBe(true);
    expect(await hasClass(buyCheck, "is-revealed")).toBe(false);

    // 明示操作として blur（ユーザーが入力を終えてフォーカスを外す動作）
    await expense.blur();

    // blur 後: ここで初めて commit & reveal（意図したタイミング）
    await expect(page.locator("body")).not.toHaveClass(/app-empty/);
    expect(await hasClass(buyCheck, "is-revealed"), "blur 後も buy-check が reveal されない").toBe(true);
    expect(await isInert(buyCheck), "reveal 後も buy-check が inert のまま").toBe(false);
  });

  test("C1(モバイル幅): 入力中に buyAmount が操作可能にならない（フォーカス吸取の前提を作らない）", async ({ page }) => {
    // モバイルは入力欄が縦積み。3つ目入力中に buy-check が出ると指が触れやすく事故が起きやすい。
    await page.setViewportSize({ width: 390, height: 844 });
    const expense = page.locator("#monthlyExpense");

    await page.locator("#currentCash").fill(SAMPLE.currentCash);
    await page.locator("#monthlyIncome").fill(SAMPLE.monthlyIncome);
    await expense.focus();
    await expense.pressSequentially(SAMPLE.monthlyExpense, { delay: 15 });

    // 入力中に buyAmount が操作可能になっていないこと（inert か非表示なら触れない＝事故が起きない）
    const reachable = await page.locator("#buyAmount").evaluate((el) => {
      const hiddenByInert = el.closest("[inert]") !== null;
      const style = getComputedStyle(el);
      const invisible = style.visibility === "hidden" || style.display === "none" || el.offsetParent === null;
      return !hiddenByInert && !invisible;
    });
    expect(reachable, "入力中に buyAmount が操作可能になっている（フォーカスが吸われる事故の条件）").toBe(false);
  });

  test("C5: 例を入れて試す → 空状態から結果表示まで進む（前回P1の回帰ガード）", async ({ page }) => {
    // 空状態であることを確認してから明示操作
    expect(await hasBodyClass(page, "app-empty")).toBe(true);
    await page.locator("#sampleButton").click();
    await expectProgressedToResults(page, "例を入れて試す");
  });

  test("C6: JSON 読み込み → 空状態から結果表示まで進む（前回P1の回帰ガード）", async ({ page }) => {
    expect(await hasBodyClass(page, "app-empty")).toBe(true);
    const json = io.toJson(sampleInput());
    // hidden file input へ buffer を直接渡す（FileReader→applyInputToForm→update({commitLayout:true}) が走る）
    await page.locator("#importJsonInput").setInputFiles({
      name: "futokoro.json",
      mimeType: "application/json",
      buffer: Buffer.from(json, "utf8"),
    });
    await expectProgressedToResults(page, "JSON読み込み");
  });

  test("C6b: CSV 読み込み → 空状態から結果表示まで進む（前回P1の回帰ガード）", async ({ page }) => {
    expect(await hasBodyClass(page, "app-empty")).toBe(true);
    const labels = Array.from({ length: MONTH_COUNT }, (_, i) => `2026/${String(i + 1).padStart(2, "0")}`);
    const csv = io.toCsv(sampleInput(), labels);
    await page.locator("#importCsvInput").setInputFiles({
      name: "futokoro.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf8"),
    });
    await expectProgressedToResults(page, "CSV読み込み");
  });
});
