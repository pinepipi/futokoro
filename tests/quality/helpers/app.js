// 共通ヘルパー — アプリのロード・固定入力・状態遷移
// 静的サイトを file:// で開く。月ラベルが実行日に依存しないよう clock を固定する。
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const APP_URL = pathToFileURL(path.join(__dirname, "..", "..", "..", "index.html")).href;

// VISUAL_STATES.md で固定したサンプル家計（filled 系で常に同じ値）
const SAMPLE = {
  currentCash: "1200000",
  monthlyIncome: "380000",
  monthlyExpense: "280000",
};

// 走っているトランジション/アニメの完了を待って静止させる（凍結ではなく settle）。
// layout-check / スクショが過渡状態を拾う flakiness を根本から防ぐ。無限アニメ対策に上限つき。
async function settleMotion(page) {
  await page
    .evaluate(
      () =>
        Promise.race([
          Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))),
          new Promise((r) => setTimeout(r, 600)),
        ])
    )
    .catch(() => {});
}

// goto 前に clock を固定 → 安定したスクショ/月ラベル
async function openApp(page) {
  await page.clock.install({ time: new Date("2026-06-15T00:00:00") });
  // reset の確認ダイアログは承認（承認しないとクリアされない）
  page.on("dialog", (dialog) => dialog.accept().catch(() => {}));
  await page.goto(APP_URL);
  await page.waitForSelector("#simulatorForm");
}

// 3つの基本入力を埋めて計算結果へ反映
async function fillBasics(page, values = SAMPLE) {
  await page.fill("#currentCash", values.currentCash);
  await page.fill("#monthlyIncome", values.monthlyIncome);
  await page.fill("#monthlyExpense", values.monthlyExpense);
  await page.click("#applyButton");
  // ヒーロー月数が確定値（-- でない）になるまで待つ
  await page
    .locator("#monthsBadge")
    .filter({ hasNotText: "--" })
    .first()
    .waitFor({ timeout: 5000 })
    .catch(() => {});
  await settleMotion(page);
}

// 結果ボードのタブ切替（now / notes / chart / table）
const TAB_IDS = { now: "#viewNowTab", notes: "#viewNotesTab", chart: "#viewChartTab", table: "#viewTableTab" };
const PANEL_IDS = { now: "#view-now", notes: "#view-notes", chart: "#view-chart", table: "#view-table" };

async function switchTab(page, view) {
  await page.click(TAB_IDS[view]);
  await page.locator(PANEL_IDS[view]).waitFor({ state: "visible" });
  await settleMotion(page); // 280ms トランジション完了まで待ってから判定/撮影
}

module.exports = { APP_URL, SAMPLE, openApp, fillBasics, switchTab, settleMotion, TAB_IDS, PANEL_IDS };
