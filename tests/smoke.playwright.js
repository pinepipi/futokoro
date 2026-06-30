// ふところ.com E2Eスモークテスト（スタンドアロン版・self-contained）
//
// 実行: node tests/smoke.playwright.js
// - playwright は本プロジェクト → なければ ../ai-dev-studio の node_modules から読む
// - index.html を file:// で開く（Webサーバー不要）
// - 日付は clock.install で固定（monthLabel が実行日に依存しないように）
// - 文言は活発に改善中のため、テストは「計算結果・構造・プライバシー・遷移・レイアウト」
//   などの安定した不変条件を中心に検証し、細かいコピー文字列には依存しない。
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = loadPlaywright();

function loadPlaywright() {
  try {
    return require("playwright");
  } catch (error) {
    const sharedInstall = path.join(__dirname, "..", "..", "ai-dev-studio", "node_modules", "playwright");
    return require(sharedInstall);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  // 月ラベル（new Date()）を固定して結果を実行日に依存させない
  await page.clock.install({ time: new Date("2026-06-15T00:00:00") });
  const requests = [];
  const consoleMessages = [];
  // リセットの確認ダイアログを承認（承認しないとクリアされない）
  page.on("dialog", (dialog) => dialog.accept().catch(() => {}));
  page.on("request", (request) => requests.push(request.url()));
  page.on("console", (message) => consoleMessages.push(`${message.type()}: ${message.text()}`));

  const appUrl = pathToFileURL(path.join(__dirname, "..", "index.html")).href;
  await page.goto(appUrl);

  // --- 基本3項目のみ ---
  await page.fill("#currentCash", "900000");
  await page.fill("#monthlyIncome", "550000");
  await page.fill("#monthlyExpense", "430000");

  const basicOnly = await page.evaluate(() => ({
    optionalOpen: document.querySelector("#extra-months")?.open,
    monthInputRows: document.querySelectorAll("#monthInputs tr").length,
    applyText: document.querySelector("#applyButton")?.textContent?.trim(),
    primaryLabel: document.querySelector(".metric-card.highlight span")?.textContent,
    rulerReadout: document.querySelector("#rulerReadout")?.textContent,
    rulerValue: Number(document.querySelector("#fundRulerMeter")?.value),
    months: document.querySelector("#monthsBadge")?.textContent,
    ending: document.querySelector("#endingBalance")?.textContent
  }));

  // --- 今月・来月以降パネルを開いて今月の大きな出費を入力 ---
  await page.click("#extra-months summary");
  await page.fill('.month-field[data-kind="extraExpense"][data-index="0"]', "700000");
  await page.click("#applyButton");
  const quickExtra = await page.evaluate(() => ({
    monthCard: document.querySelector('.month-field[data-kind="extraExpense"][data-index="0"]')?.value,
    ending: document.querySelector("#endingBalance")?.textContent,
    noteEvents: [...document.querySelectorAll(".note-event")].map((node) => node.textContent)
  }));

  // --- 今月クリア → 反映（クリアで元に戻る） ---
  await page.fill('.month-field[data-kind="extraExpense"][data-index="0"]', "");
  await page.click("#applyButton");
  const clearedExtra = await page.evaluate(() => ({
    monthCard: document.querySelector('.month-field[data-kind="extraExpense"][data-index="0"]')?.value,
    ending: document.querySelector("#endingBalance")?.textContent,
    noteEvents: [...document.querySelectorAll(".note-event")].map((node) => node.textContent)
  }));

  // --- 今月の大きな出費 + 来月以降の臨時収支を入力 ---
  await page.fill('.month-field[data-kind="extraExpense"][data-index="0"]', "700000");
  await page.fill('.month-field[data-kind="extraIncome"][data-index="1"]', "1000000");
  await page.fill('.month-field[data-kind="extraExpense"][data-index="1"]', "200000");
  await page.click("#extraMonthsDone");
  await page.click("#applyButton");

  const mobile = await page.evaluate(() => ({
    title: document.title,
    months: document.querySelector("#monthsBadge")?.textContent,
    ending: document.querySelector("#endingBalance")?.textContent,
    lowest: document.querySelector("#lowestMonth")?.textContent,
    monthCard: document.querySelector('.month-field[data-kind="extraExpense"][data-index="0"]')?.value,
    secondMonthIncome: document.querySelector('.month-field[data-kind="extraIncome"][data-index="1"]')?.value,
    secondMonthExpense: document.querySelector('.month-field[data-kind="extraExpense"][data-index="1"]')?.value,
    feedbackText: document.querySelector('a.privacy-badge[href="./feedback.html"]')?.textContent,
    viewHeaderText: document.querySelector(".view-header")?.textContent,
    noteCount: document.querySelectorAll(".month-note").length,
    noteEvents: [...document.querySelectorAll(".note-event")].map((node) => node.textContent),
    localStorageLength: localStorage.length,
    sessionStorageLength: sessionStorage.length,
    cookie: document.cookie,
    adHidden: document.querySelector("[data-ad-slot-key='footer']")?.hidden,
    adStatus: document.querySelector("[data-ad-slot-key='footer']")?.dataset.adStatus,
    adsenseScriptCount: document.querySelectorAll("script[src*='pagead2.googlesyndication.com']").length,
    metaDescription: document.querySelector('meta[name="description"]')?.getAttribute("content"),
    ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute("content"),
    canonicalCount: document.querySelectorAll('link[rel="canonical"]').length,
    bodyScrollWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth
  }));

  const mobileOrder = await page.evaluate(() => {
    const y = (selector) => {
      const element = document.querySelector(selector);
      return element ? Math.round(element.getBoundingClientRect().top + window.scrollY) : null;
    };
    return {
      input: y(".input-panel"),
      results: y(".results-column"),
      support: y(".support-panel"),
      notice: y(".notice-panel"),
      feedback: y('a.privacy-badge[href="./feedback.html"]')
    };
  });

  // --- 「これ買える？」判定（フィーチャの基本動作） ---
  await page.fill("#buyAmount", "50000");
  await page.click("#buyCheckButton");
  const buyCheck = await page.evaluate(() => ({
    hidden: document.querySelector("#buyResult")?.hidden,
    verdict: document.querySelector("#buyVerdict")?.textContent?.trim(),
    reason: document.querySelector("#buyReason")?.textContent?.trim()
  }));

  const initialView = await page.evaluate(() => ({
    active: document.querySelector("[data-view-tab][aria-selected='true']")?.dataset.viewTab,
    nowHidden: document.querySelector("#view-now")?.hidden,
    notesHidden: document.querySelector("#view-notes")?.hidden,
    chartHidden: document.querySelector("#view-chart")?.hidden,
    tableHidden: document.querySelector("#view-table")?.hidden
  }));

  await page.click("#viewNotesTab");
  const notesView = await page.evaluate(() => ({
    active: document.querySelector("[data-view-tab][aria-selected='true']")?.dataset.viewTab,
    nowHidden: document.querySelector("#view-now")?.hidden,
    notesHidden: document.querySelector("#view-notes")?.hidden,
    chartHidden: document.querySelector("#view-chart")?.hidden,
    tableHidden: document.querySelector("#view-table")?.hidden,
    noteCount: document.querySelectorAll(".month-note").length
  }));

  await page.click("#viewChartTab");
  const chartView = await page.evaluate(() => ({
    active: document.querySelector("[data-view-tab][aria-selected='true']")?.dataset.viewTab,
    chartHidden: document.querySelector("#view-chart")?.hidden,
    pointCount: document.querySelectorAll(".chart-dot").length,
    lowestLabel: document.querySelector(".chart-lowest-label")?.textContent
  }));

  await page.click("#viewTableTab");
  const tableView = await page.evaluate(() => ({
    active: document.querySelector("[data-view-tab][aria-selected='true']")?.dataset.viewTab,
    tableHidden: document.querySelector("#view-table")?.hidden,
    rowCount: document.querySelectorAll("#projectionRows tr").length
  }));

  // --- リセット（確認ダイアログを承認 → クリア） ---
  await page.click("#viewNowTab");
  await page.click("#resetButton");
  await page.waitForTimeout(20);
  const reset = await page.evaluate(() => ({
    currentCash: document.querySelector("#currentCash")?.value,
    monthlyIncome: document.querySelector("#monthlyIncome")?.value,
    monthlyExpense: document.querySelector("#monthlyExpense")?.value,
    monthCard: document.querySelector('.month-field[data-kind="extraExpense"][data-index="0"]')?.value,
    resultsEmpty: document.querySelector(".results-board")?.classList.contains("is-empty"),
    months: document.querySelector("#monthsBadge")?.textContent,
    ending: document.querySelector("#endingBalance")?.textContent,
    rulerReadout: document.querySelector("#rulerReadout")?.textContent,
    rulerValue: Number(document.querySelector("#fundRulerMeter")?.value)
  }));

  // --- 赤字（収入0・現金少）ケース ---
  await page.fill("#currentCash", "100000");
  await page.fill("#monthlyIncome", "0");
  await page.fill("#monthlyExpense", "300000");
  const negativeCase = await page.evaluate(() => ({
    months: document.querySelector("#monthsBadge")?.textContent,
    ending: document.querySelector("#endingBalance")?.textContent,
    lowest: document.querySelector("#lowestMonth")?.textContent,
    bodyScrollWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth
  }));

  // --- ページ遷移（プライバシー / 問い合わせ） ---
  await page.click(".notice-details summary");
  await page.click('a[href="./privacy.html"]');
  const privacy = await page.evaluate(() => ({ title: document.title, heading: document.querySelector("h1")?.textContent }));
  await page.goBack();

  await page.click('a.privacy-badge[href="./feedback.html"]');
  const feedback = await page.evaluate(() => ({ title: document.title, heading: document.querySelector("h1")?.textContent }));
  await page.goBack();

  // --- bfcache 相当（pageshow で再計算される） ---
  await page.waitForTimeout(20);
  await page.fill("#currentCash", "100000");
  await page.fill("#monthlyIncome", "0");
  await page.fill("#monthlyExpense", "300000");
  await page.evaluate(() => {
    document.querySelector(".results-board")?.classList.add("is-empty");
    window.dispatchEvent(new Event("pageshow"));
  });
  const recalculatedAfterPageshow = await page.evaluate(() => ({
    resultsEmpty: document.querySelector(".results-board")?.classList.contains("is-empty"),
    months: document.querySelector("#monthsBadge")?.textContent
  }));

  // --- デスクトップ幅で横スクロールが出ない ---
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.waitForTimeout(350);
  const desktop = await page.evaluate(() => ({ bodyScrollWidth: document.body.scrollWidth, viewportWidth: window.innerWidth }));

  await browser.close();

  // ===== アサーション =====
  // 計算（クロック固定 2026-06 起点）
  assert.equal(basicOnly.optionalOpen, false, "今月・来月以降パネルは初期で閉じている");
  assert.equal(basicOnly.monthInputRows, 12, "今月〜12ヶ月目の入力行は12");
  assert.ok(basicOnly.applyText && basicOnly.applyText.length > 0, "反映ボタンに文言がある");
  assert.equal(basicOnly.primaryLabel, "12ヶ月でいちばん薄い月");
  assert.equal(basicOnly.rulerReadout, "2.1ヶ月分");
  assert.equal(Math.round(basicOnly.rulerValue * 10) / 10, 2.1);
  assert.equal(basicOnly.months, "2.1ヶ月分");
  assert.equal(basicOnly.ending, "2,340,000円");

  assert.equal(quickExtra.monthCard, "700,000");
  assert.equal(quickExtra.ending, "1,640,000円");
  assert.deepEqual(quickExtra.noteEvents, ["大きな出費 -700,000円"]);

  assert.equal(clearedExtra.monthCard, "");
  assert.equal(clearedExtra.ending, "2,340,000円");
  assert.deepEqual(clearedExtra.noteEvents, []);

  assert.equal(mobile.title, "ふところ.com | この出費、今して大丈夫？");
  assert.equal(mobile.months, "2.1ヶ月分");
  assert.equal(mobile.ending, "2,440,000円");
  assert.match(mobile.lowest, /320,000円/);
  assert.equal(mobile.monthCard, "700,000");
  assert.equal(mobile.secondMonthIncome, "1,000,000");
  assert.equal(mobile.secondMonthExpense, "200,000");
  assert.match(mobile.feedbackText, /要望・問い合わせ/);
  // タブ名（名詞でそろえる方針の確認・比較的安定）
  assert.match(mobile.viewHeaderText, /まとめ/);
  assert.match(mobile.viewHeaderText, /付箋/);
  assert.match(mobile.viewHeaderText, /残高グラフ/);
  assert.match(mobile.viewHeaderText, /金額表/);
  assert.equal(mobile.noteCount, 12);
  assert.equal(mobile.noteEvents.some((t) => /大きな出費 -700,000円/.test(t)), true);
  assert.equal(mobile.noteEvents.some((t) => /臨時収入 \+1,000,000円/.test(t)), true);
  assert.equal(mobile.noteEvents.some((t) => /大きな出費 -200,000円/.test(t)), true);
  assert.match(mobile.metaDescription, /金額は保存も送信もしない/);
  assert.equal(mobile.ogTitle, "ふところ.com | この出費、今して大丈夫？");
  assert.equal(mobile.canonicalCount, 0);

  // 動線順（モバイル）: 問い合わせはヘッダー（最上部）／入力→結果→次の一歩→免責
  assert.equal(mobileOrder.feedback < mobileOrder.input, true, "問い合わせリンクはヘッダー（最上部）");
  assert.equal(mobileOrder.input < mobileOrder.results, true, "入力は結果より上");
  assert.equal(mobileOrder.results < mobileOrder.support, true);
  assert.equal(mobileOrder.support < mobileOrder.notice, true);

  // これ買える？判定が動く（文言ではなく動作を検証）
  assert.equal(buyCheck.hidden, false, "判定結果が表示される");
  assert.ok(buyCheck.verdict && buyCheck.verdict.length > 0, "判定の見出しが出る");
  assert.ok(buyCheck.reason && buyCheck.reason.length > 0, "判定の理由が出る");

  // タブ表示切替
  assert.deepEqual(initialView, { active: "now", nowHidden: false, notesHidden: true, chartHidden: true, tableHidden: true });
  assert.deepEqual(notesView, { active: "notes", nowHidden: true, notesHidden: false, chartHidden: true, tableHidden: true, noteCount: 12 });
  assert.deepEqual(chartView, { active: "chart", chartHidden: false, pointCount: 12, lowestLabel: "いちばん少ない月: 2026/06 320,000円" });
  assert.deepEqual(tableView, { active: "table", tableHidden: false, rowCount: 12 });

  // リセット（確認承認 → 全クリア）
  assert.equal(reset.currentCash, "");
  assert.equal(reset.monthlyIncome, "");
  assert.equal(reset.monthlyExpense, "");
  assert.equal(reset.monthCard, "");
  assert.equal(reset.resultsEmpty, true);
  assert.equal(reset.months, "--ヶ月分");
  assert.equal(reset.ending, "--円");
  assert.equal(reset.rulerReadout, "--");
  assert.equal(reset.rulerValue, 0);

  // 赤字ケース
  assert.equal(negativeCase.months, "0.3ヶ月分");
  assert.equal(negativeCase.ending, "-3,500,000円");
  assert.match(negativeCase.lowest, /-3,500,000円/);
  assert.equal(negativeCase.bodyScrollWidth <= negativeCase.viewportWidth, true);

  // 遷移
  assert.equal(privacy.title, "プライバシーポリシー | ふところ.com");
  assert.equal(privacy.heading, "プライバシーポリシー");
  assert.equal(feedback.title, "要望・問い合わせ | ふところ.com");
  assert.equal(feedback.heading, "要望・問い合わせ");

  // pageshow 再計算
  assert.equal(recalculatedAfterPageshow.resultsEmpty, false);
  assert.equal(recalculatedAfterPageshow.months, "0.3ヶ月分");

  // プライバシー不変条件（保存・送信なし）
  assert.equal(mobile.localStorageLength, 0);
  assert.equal(mobile.sessionStorageLength, 0);
  assert.equal(mobile.cookie, "");
  assert.equal(mobile.adHidden, true);
  assert.equal(mobile.adStatus, "disabled");
  assert.equal(mobile.adsenseScriptCount, 0);
  assert.equal(requests.every((url) => url.startsWith("file://")), true, "外部リクエストなし（file://のみ）");

  // レイアウト（横スクロールなし）
  assert.equal(mobile.bodyScrollWidth <= mobile.viewportWidth, true);
  assert.equal(desktop.bodyScrollWidth <= desktop.viewportWidth, true);

  // コンソールエラーなし
  assert.equal(consoleMessages.length, 0, `console messages: ${consoleMessages.join(" | ")}`);

  console.log("✅ e2e smoke passed (all assertions)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
