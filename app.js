const domain = window.LifeDefenseDomain;
const { MONTH_COUNT, CASH_MAX, MONTHLY_AMOUNT_MAX, parseAmount } = domain;
const MONTH_FIELD_KINDS = new Set(["card", "extraIncome", "extraExpense"]);
const SVG_NS = "http://www.w3.org/2000/svg";

// 入力不足時の案内（空状態・renderBlank と buildActions で共通化）
const EMPTY_GUIDANCE = [
  "毎月の生活費を入れると、現金が何ヶ月分あるか出せます",
  "カード払いなど今月の予定は、分かる時だけ追加できます",
  "ボーナスや一括請求は、必要な月だけ来月以降に追加できます"
];

const elements = {
  form: document.querySelector("#simulatorForm"),
  monthInputs: document.querySelector("#monthInputs"),
  applyButton: document.querySelector("#applyButton"),
  applyHint: document.querySelector("#applyHint"),
  viewTabs: document.querySelectorAll("[data-view-tab]"),
  viewPanels: document.querySelectorAll("[data-view-panel]"),
  resultsBoard: document.querySelector(".results-board"),
  statusPanel: document.querySelector(".status-panel"),
  statusLabel: document.querySelector("#statusLabel"),
  statusMessage: document.querySelector("#statusMessage"),
  lowestHint: document.querySelector("#lowestHint"),
  monthsBadge: document.querySelector("#monthsBadge"),
  monthsBadgeNote: document.querySelector("#monthsBadgeNote"),
  monthsBadgeSr: document.querySelector("#monthsBadgeSr"),
  fundRulerMeter: document.querySelector("#fundRulerMeter"),
  dialNeedle: document.querySelector("#dialNeedle"),
  dialProgress: document.querySelector("#dialProgress"),
  rulerReadout: document.querySelector("#rulerReadout"),
  rulerStage: document.querySelector("#rulerStage"),
  progress3Fill: document.querySelector("#progress3Fill"),
  progress3Text: document.querySelector("#progress3Text"),
  progress6Fill: document.querySelector("#progress6Fill"),
  progress6Text: document.querySelector("#progress6Text"),
  goal3Amount: document.querySelector("#goal3Amount"),
  goal6Amount: document.querySelector("#goal6Amount"),
  endingBalance: document.querySelector("#endingBalance"),
  lowestMonth: document.querySelector("#lowestMonth"),
  noteBoardBadge: document.querySelector("#noteBoardBadge"),
  noteBoardMonths: document.querySelector("#noteBoardMonths"),
  noteBoardLabel: document.querySelector("#noteBoardLabel"),
  noteBoardSr: document.querySelector("#noteBoardSr"),
  noteBoardMessage: document.querySelector("#noteBoardMessage"),
  noteBoardTarget6: document.querySelector("#noteBoardTarget6"),
  monthNotes: document.querySelector("#monthNotes"),
  balanceChart: document.querySelector("#balanceChart"),
  chartCaption: document.querySelector("#chartCaption"),
  projectionRows: document.querySelector("#projectionRows"),
  actionList: document.querySelector("#actionList"),
  sampleButton: document.querySelector("#sampleButton"),
  buyCheckSection: document.querySelector("#buy-check-section"),
  basicsHint: document.querySelector("#basicsHint"),
  bmAge: document.querySelector("#bmAge"),
  bmHousehold: document.querySelector("#bmHousehold"),
  bmAsset: document.querySelector("#bmAsset"),
  bmCompareButton: document.querySelector("#bmCompareButton"),
  bmResult: document.querySelector("#bmResult"),
  bmSource: document.querySelector("#bmSource")
};

function setActiveView(view) {
  document.body.dataset.activeView = view;
  elements.viewTabs.forEach((tab) => {
    const isActive = tab.dataset.viewTab === view;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
    // roving tabindex: アクティブなタブだけTab移動で到達、残りは矢印キーで移動
    tab.tabIndex = isActive ? 0 : -1;
  });

  elements.viewPanels.forEach((panel) => {
    const isActive = panel.dataset.viewPanel === view;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });
}

function yen(value) {
  if (!Number.isFinite(value)) return "--円";
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

function clearChildren(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function appendCell(row, text, className = "") {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  cell.textContent = text;
  row.appendChild(cell);
  return cell;
}

function appendSvg(parent, name, attributes = {}, text = "") {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });
  if (text) element.textContent = text;
  parent.appendChild(element);
  return element;
}

function appendInputCell(row, label, kind, index) {
  const cell = document.createElement("td");
  const input = document.createElement("input");
  input.className = "month-field";
  input.dataset.kind = kind;
  input.dataset.index = String(index);
  input.dataset.amountInput = "";
  input.type = "text";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.placeholder = "0";
  input.setAttribute("aria-label", label);
  cell.appendChild(input);
  row.appendChild(cell);
}

function monthLabel(offset) {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function renderMonthInputs() {
  clearChildren(elements.monthInputs);

  Array.from({ length: MONTH_COUNT }, (_, index) => {
    const label = monthLabel(index);
    const row = document.createElement("tr");
    appendCell(row, label, "month-label");
    appendInputCell(row, `${label}の大きな出費`, "extraExpense", index);
    appendInputCell(row, `${label}の臨時収入`, "extraIncome", index);
    elements.monthInputs.appendChild(row);
  });
}

function maxForAmountField(field) {
  return field.id === "currentCash" ? CASH_MAX : MONTHLY_AMOUNT_MAX;
}

function formatAmountValue(value, max = MONTHLY_AMOUNT_MAX) {
  const parsed = parseAmount(value, max);
  if (parsed <= 0 || Math.round(parsed) === 0) return "";
  return Math.round(parsed).toLocaleString("ja-JP");
}

function formatAmountField(field) {
  field.value = formatAmountValue(field.value, maxForAmountField(field));
}

function formatAllAmountFields() {
  document.querySelectorAll("[data-amount-input]").forEach((field) => {
    formatAmountField(field);
  });
}

function readInput() {
  const base = {
    currentCash: parseAmount(document.querySelector("#currentCash").value, CASH_MAX),
    monthlyIncome: parseAmount(document.querySelector("#monthlyIncome").value, MONTHLY_AMOUNT_MAX),
    monthlyExpense: parseAmount(document.querySelector("#monthlyExpense").value, MONTHLY_AMOUNT_MAX),
    months: Array.from({ length: MONTH_COUNT }, (_, index) => ({
      label: monthLabel(index),
      card: 0,
      extraIncome: 0,
      extraExpense: 0
    }))
  };

  document.querySelectorAll(".month-field").forEach((field) => {
    const index = Number(field.dataset.index);
    const kind = field.dataset.kind;
    if (!Number.isInteger(index) || index < 0 || index >= base.months.length) return;
    if (!MONTH_FIELD_KINDS.has(kind)) return;
    base.months[index][kind] = parseAmount(field.value, MONTHLY_AMOUNT_MAX);
  });

  return base;
}

function statusFor(months, ctx) {
  if (!Number.isFinite(months)) {
    return {
      key: "",
      label: "生活費を入れると見えてきます",
      message: "毎月の生活費を入れると、手元の現金が何ヶ月分あるかを試算します。"
    };
  }

  const {
    monthlyIncome = 0, monthlyExpense = 0, currentCash = 0,
    targets = {}, lowest = null, isLowestThisMonth = false
  } = ctx || {};

  const savingsRate   = monthlyIncome - monthlyExpense;
  const gap3          = targets.gap3  || 0;
  const target3       = targets.target3 || 0;
  const target6       = targets.target6 || 0;
  const gap6          = targets.gap6  || 0;
  const daysCovered   = Math.round(months * 30);
  const toNext1       = Math.max(0, monthlyExpense - currentCash);
  const monthsTo3     = savingsRate > 0 && gap3 > 0 ? Math.ceil(gap3 / savingsRate) : null;

  // 入力値から決定的にバリアント 0/1/2 を選ぶ（同条件は常に同じ文）
  const v = monthlyExpense > 0
    ? Math.abs(Math.floor((currentCash / monthlyExpense) * 100)) % 3
    : 0;

  // 副文：最も重要な1文だけ付加（長文化を防ぐ）
  function sfx() {
    if (lowest && lowest.balance < 0 && months < 3)
      return `${lowest.label}には残高がマイナスになる見通し。支出の見直しが先決です。`;
    if (savingsRate < 0 && monthlyIncome > 0 && months < 3)
      return `毎月${yen(Math.abs(savingsRate))}ずつ減っています。支出の見直しが先決です。`;
    if (isLowestThisMonth && months < 3)
      return "いまが12ヶ月でいちばん薄い月。ここを越えれば持ち直す見通しです。";
    if (savingsRate > 0 && monthsTo3 !== null && months < 2)
      return `毎月${yen(savingsRate)}残せているので、3ヶ月分まで約${monthsTo3}ヶ月で届きます。`;
    return null;
  }

  function msg(head) {
    const s = sfx();
    return s ? `${head} ${s}` : head;
  }

  // 0〜0.5ヶ月（緊急）
  if (months < 0.5) {
    const h = [
      `現金は生活費の約${daysCovered}日分。まず今月の引落し予定をすべて確認しましょう。`,
      `手元の${yen(currentCash)}は生活費${yen(monthlyExpense)}の${daysCovered}日分。今月の支払いを今日確認してください。`,
      `生活費の${daysCovered}日分しかありません。今月を乗り切ることを最優先に。`
    ];
    return { key: "danger", label: "今月の支払いを確認する時期", message: msg(h[v]) };
  }

  // 0.5〜1ヶ月（危険）
  if (months < 1) {
    const h = monthlyExpense > 0
      ? [
          `あと${yen(toNext1)}で1ヶ月分の壁を越えられます。今月の不要な支払いを一つ止めてみましょう。`,
          `生活費の1ヶ月分まであと${yen(toNext1)}。最初のゴールはすぐそこです。`,
          `現金は生活費の${months.toFixed(1)}ヶ月分。1ヶ月分（${yen(monthlyExpense)}）を今の目標にしましょう。`
        ]
      : ["いまの現金は生活費の1ヶ月分未満です。まず今月の支払いとカードの引落しを確認しましょう。"];
    return { key: "danger", label: "支払いを確認する時期", message: msg(h[v % h.length]) };
  }

  // 1〜2ヶ月（立ち上がり）
  if (months < 2) {
    const h = [
      monthsTo3 !== null
        ? `1ヶ月分の壁を越えました。毎月${yen(savingsRate)}続ければ、3ヶ月分まで約${monthsTo3}ヶ月で届きます。`
        : `1ヶ月分の備えができています。次の目標は3ヶ月分（${yen(target3)}）です。`,
      `生活費の1ヶ月分を確保しています。毎月少しずつ残す習慣を続けていきましょう。`,
      `1〜2ヶ月分の範囲。まず3ヶ月分（${yen(target3)}）を目指して積み上げていきましょう。`
    ];
    return { key: "warn", label: "3ヶ月分へ積み増す時期", message: msg(h[v]) };
  }

  // 2〜3ヶ月（3ヶ月前夜）
  if (months < 3) {
    const h = [
      `3ヶ月分の安心ラインまで、あと${yen(gap3)}。ゴールが見えています。`,
      `生活費の${months.toFixed(1)}ヶ月分。3ヶ月分（${yen(target3)}）まであと${yen(gap3)}です。`,
      `あと${yen(gap3)}で3ヶ月分の目標に届きます。この調子を続けましょう。`
    ];
    return { key: "warn", label: "3ヶ月分へ積み増す時期", message: msg(h[v]) };
  }

  // 3〜6ヶ月（ひと安心）
  if (months < 6) {
    const h = [
      `生活費の3〜6ヶ月分の範囲です。急な出費があっても落ち着いて回せる目安に入っています。`,
      `3ヶ月分の安心ラインをクリア。6ヶ月分（${yen(target6)}）まであと${yen(gap6)}です。`,
      `ひと安心できる備えがあります。6ヶ月分（${yen(target6)}）を次の目標に。`
    ];
    return { key: "safe", label: "ひと安心できる範囲", message: h[v] };
  }

  // 6〜12ヶ月（達成）
  if (months < 12) {
    const h = [
      `生活費の6ヶ月分以上。急な収入減があっても半年以上対応できます。`,
      `${Math.floor(months)}ヶ月分超の備えがあります。進学・車検・医療など大きな出費にも対応できる水準です。`,
      `生活費の${months.toFixed(0)}ヶ月分以上。しっかりとした備えができています。`
    ];
    return { key: "safe", label: "しっかりした備えがある時期", message: h[v] };
  }

  // 12ヶ月以上（余剰）
  const h = [
    `生活費の1年分以上の現金があります。守りは万全。一部は目的別口座に分けることも検討できます。`,
    `${Math.floor(months)}ヶ月分超の備えは十分。インフレで目減りしない置き場を検討する段階です。`,
    `生活費の1年分超。安心感は高い一方、現金の置きすぎは機会損失になる場合もあります。`
  ];
  return { key: "safe", label: "余白を育てる時期", message: h[v] };
}

function hasMeaningfulInput(input) {
  if (input.currentCash > 0 || input.monthlyIncome > 0 || input.monthlyExpense > 0) return true;
  return input.months.some((month) => month.card > 0 || month.extraIncome > 0 || month.extraExpense > 0);
}

function renderActions(actions) {
  clearChildren(elements.actionList);
  actions.forEach((action) => {
    const item = document.createElement("li");
    item.textContent = action;
    elements.actionList.appendChild(item);
  });
}

function progressRatio(current, target) {
  if (!Number.isFinite(target) || target <= 0) return Number.NaN;
  return Math.min(Math.max(current / target, 0), 1);
}

// 進捗テキストは「あといくら必要か」を主役にし、達成率(%)を併記する。
// 「54%」だけだと貯まった額/必要額/残額のどれか分からない指摘への対応。
function renderProgress(fill, text, current, target, gap) {
  const ratio = progressRatio(current, target);
  const percent = Number.isFinite(ratio) ? Math.round(ratio * 100) : null;
  fill.style.width = Number.isFinite(ratio) ? `${(ratio * 100).toFixed(1)}%` : "0%";
  const row = fill.closest(".goal-progress-row");
  if (percent === null) {
    text.textContent = "--";
    if (row) row.classList.remove("is-achieved");
    return;
  }
  const achieved = gap <= 0;
  if (row) row.classList.toggle("is-achieved", achieved);
  text.textContent = achieved ? "達成" : `あと${yen(gap)}（${percent}%）`;
}

function renderBlank() {
  elements.resultsBoard.classList.add("is-empty");
  elements.resultsBoard.classList.remove("has-result");
  elements.statusPanel.className = "panel status-panel";
  elements.statusLabel.textContent = "3つ入れると見えてきます";
  elements.monthsBadge.textContent = "--ヶ月分";
  if (elements.monthsBadgeSr) elements.monthsBadgeSr.textContent = "まだ試算していません";
  if (elements.monthsBadgeNote) elements.monthsBadgeNote.textContent = "収入が止まっても、いまの現金で暮らせる月数の目安です";
  elements.statusMessage.textContent = "現金・手取り・毎月の生活費だけで、手元のお金が何ヶ月分あるかを出します。";
  elements.lowestHint.textContent = "いちばん薄い月は、入力後に表示します。";
  elements.fundRulerMeter.value = 0;
  elements.fundRulerMeter.textContent = "0ヶ月分";
  elements.dialNeedle.setAttribute("transform", "rotate(-90 100 98)");
  elements.dialProgress.setAttribute("stroke-dasharray", "0 100");
  elements.rulerReadout.textContent = "--";
  elements.rulerStage.textContent = "数字を入れると、現金が何ヶ月分あるか出ます。";
  renderProgress(elements.progress3Fill, elements.progress3Text, 0, 0, 0);
  renderProgress(elements.progress6Fill, elements.progress6Text, 0, 0, 0);
  if (elements.goal3Amount) elements.goal3Amount.textContent = "--";
  if (elements.goal6Amount) elements.goal6Amount.textContent = "--";
  elements.endingBalance.textContent = "--円";
  elements.endingBalance.className = "";
  elements.lowestMonth.textContent = "--";
  elements.lowestMonth.className = "";
  elements.noteBoardBadge.textContent = "今のふところ";
  elements.noteBoardMonths.textContent = "--ヶ月分";
  if (elements.noteBoardSr) elements.noteBoardSr.textContent = "まだ試算していません";
  elements.noteBoardLabel.textContent = "いまの現金が生活費の何ヶ月分か";
  elements.noteBoardMessage.textContent = "現金・手取り・毎月の生活費だけで、12ヶ月の付箋が並びます。";
  elements.noteBoardTarget6.textContent = "--円";
  elements.chartCaption.textContent = "線が下がる月ほど現金が少ない月です";
  clearChildren(elements.monthNotes);
  clearChildren(elements.balanceChart);
  clearChildren(elements.projectionRows);
  renderActions(EMPTY_GUIDANCE);
}

function rulerStageFor(months) {
  if (!Number.isFinite(months)) return "数字を入れると、現金が何ヶ月分あるか出ます。";
  if (months < 1) return "0〜1ヶ月：支払い確認";
  if (months < 3) return "1〜3ヶ月：積み増し";
  if (months < 6) return "3〜6ヶ月：ひと安心";
  return "6ヶ月〜：余白づくり";
}

function renderDial(monthsCovered) {
  const safeMonths = Number.isFinite(monthsCovered) ? Math.min(Math.max(monthsCovered, 0), 12) : 0;
  const ratio = safeMonths / 12;
  const degrees = -90 + (ratio * 180);
  elements.fundRulerMeter.value = safeMonths;
  elements.fundRulerMeter.textContent = Number.isFinite(monthsCovered) ? `${monthsCovered.toFixed(1)}ヶ月分` : "0ヶ月分";
  elements.dialNeedle.setAttribute("transform", `rotate(${degrees.toFixed(1)} 100 98)`);
  elements.dialProgress.setAttribute("stroke-dasharray", `${Math.round(ratio * 100)} 100`);
  elements.rulerReadout.textContent = Number.isFinite(monthsCovered) ? `${monthsCovered.toFixed(1)}ヶ月分` : "--";
  elements.rulerStage.textContent = rulerStageFor(monthsCovered);
}

function buildActions(input, monthsCovered, gap3, projection) {
  if (input.monthlyExpense <= 0) {
    return EMPTY_GUIDANCE;
  }

  const lowest = projection.reduce((min, month) => month.balance < min.balance ? month : min, projection[0]);

  // 数字（月数・差額・底の月）は status と summary に既出のため、ここは行動の提案に絞る。
  if (monthsCovered < 1) {
    return [
      `いちばん薄い${lowest.label}の支払いを、先に書き出して確認する`,
      "今月のカード利用を控えめにして、引落し額を抑える",
      "固定費（通信・保険・サブスク）から、すぐ減らせるものを1つ探す"
    ];
  }

  if (monthsCovered < 3) {
    return [
      "給与日に、先に決めた額を生活費口座と分けて残す",
      `いちばん薄い${lowest.label}に向けて、減らせる固定費を1つ決める`,
      "カードの一括請求は、引落し月の生活費とは別に見ておく"
    ];
  }

  if (monthsCovered < 6) {
    return [
      "3ヶ月分は確保。次は6ヶ月分を目標に、毎月の残し額を決める",
      `${lowest.label}のような薄い月に備えて、臨時支出の予定を先に入れておく`,
      "固定費の見直しは急がず、続けられる範囲で1つずつ"
    ];
  }

  return [
    "半年分の備えあり。急な出費にも落ち着いて向き合える",
    "進学・車検・医療など大きな予定を、来月以降の付箋に入れておく",
    "使う予定のない分は、目的別に分けて置いておくと管理しやすい"
  ];
}

function renderStatus(input, projection) {
  const monthsCovered = domain.calculateEmergencyMonths(input.currentCash, input.monthlyExpense);
  const targets = domain.calculateTargets(input.currentCash, input.monthlyExpense);
  const ending = projection[projection.length - 1];
  const lowest = domain.findLowestBalanceMonth(projection);
  // 「いちばん薄い月」が今月（12ヶ月の先頭）と一致すると「今月が危ない」と誤読されるため補足する。
  const isLowestThisMonth = input.monthlyExpense > 0 && lowest && lowest.label === input.months[0].label;
  const status = statusFor(monthsCovered, {
    monthlyIncome: input.monthlyIncome,
    monthlyExpense: input.monthlyExpense,
    currentCash: input.currentCash,
    targets,
    lowest,
    isLowestThisMonth
  });

  elements.resultsBoard.classList.remove("is-empty");
  elements.resultsBoard.classList.add("has-result");
  elements.statusPanel.className = ["panel", "status-panel", status.key].filter(Boolean).join(" ");
  elements.statusLabel.textContent = status.label;
  const monthsText = Number.isFinite(monthsCovered) ? `${monthsCovered.toFixed(1)}ヶ月分` : "--ヶ月分";
  const monthsSrText = Number.isFinite(monthsCovered)
    ? `いまの現金は生活費の約${monthsCovered.toFixed(1)}ヶ月分`
    : "まだ試算していません";
  elements.monthsBadge.textContent = monthsText;
  if (elements.monthsBadgeSr) elements.monthsBadgeSr.textContent = monthsSrText;
  elements.statusMessage.textContent = status.message;
  elements.lowestHint.textContent = input.monthlyExpense > 0
    ? `これからの12ヶ月でいちばん薄いのは ${lowest.label}（残高 ${yen(lowest.balance)}）。${isLowestThisMonth ? "いまが谷で、ここから持ち直す見通しです。" : ""}`
    : "いちばん薄い月は、入力後に表示します。";
  renderDial(monthsCovered);
  renderProgress(elements.progress3Fill, elements.progress3Text, input.currentCash, targets.target3, targets.gap3);
  renderProgress(elements.progress6Fill, elements.progress6Text, input.currentCash, targets.target6, targets.gap6);
  if (elements.goal3Amount) elements.goal3Amount.textContent = input.monthlyExpense > 0 ? yen(targets.target3) : "--";
  if (elements.goal6Amount) elements.goal6Amount.textContent = input.monthlyExpense > 0 ? yen(targets.target6) : "--";
  elements.endingBalance.textContent = input.monthlyExpense > 0 ? yen(ending.balance) : "--円";
  elements.endingBalance.className = input.monthlyExpense > 0 ? (ending.balance < 0 ? "negative" : "positive") : "";
  elements.lowestMonth.textContent = input.monthlyExpense > 0 ? `${lowest.label} ${yen(lowest.balance)}` : "--";
  elements.lowestMonth.className = (input.monthlyExpense > 0 && lowest.balance < 0) ? "negative" : "";
  elements.noteBoardBadge.textContent = status.label;
  elements.noteBoardMonths.textContent = monthsText;
  if (elements.noteBoardSr) elements.noteBoardSr.textContent = monthsSrText;
  elements.noteBoardLabel.textContent = Number.isFinite(monthsCovered) ? "いまの現金が生活費の何ヶ月分か" : "生活費を入れる";
  elements.noteBoardMessage.textContent = input.monthlyExpense > 0
    ? `毎月の暮らしに${yen(input.monthlyExpense)}、手元の現金が${yen(input.currentCash)}。`
    : "生活費を入れると、12ヶ月の付箋が並びます。";
  elements.noteBoardTarget6.textContent = input.monthlyExpense > 0 ? (targets.gap6 === 0 ? "達成" : yen(targets.gap6)) : "--円";

  renderActions(buildActions(input, monthsCovered, targets.gap3, projection));
}

function noteEvents(month) {
  const events = [];
  if (month.card > 0) events.push({ text: `カード払い -${yen(month.card)}`, type: "outgoing" });
  if (month.extraIncome > 0) events.push({ text: `臨時収入 +${yen(month.extraIncome)}`, type: "income" });
  if (month.extraExpense > 0) events.push({ text: `大きな出費 -${yen(month.extraExpense)}`, type: "outgoing" });
  return events;
}

function renderMonthNotes(projection, input) {
  const containers = [elements.monthNotes].filter(Boolean);
  containers.forEach(clearChildren);
  const lowest = domain.findLowestBalanceMonth(projection);

  const expense = input.monthlyExpense > 0 ? input.monthlyExpense : 0;
  projection.forEach((month, index) => {
    const source = input.months[index];
    const events = noteEvents(source);
    containers.forEach((container) => {
      const card = document.createElement("article");
      // 色は「その月末の残高が生活費の何ヶ月分か」で決める（basis-note/凡例の4段と統一）。
      // 赤＝1ヶ月分未満（マイナス含む） / 黄＝1〜3ヶ月分 / 緑＝3〜6ヶ月分 / 濃緑＝6ヶ月分以上
      const monthsAtEnd = expense > 0 ? month.balance / expense : Infinity;
      const healthClass = monthsAtEnd < 1 ? "note-danger"
        : monthsAtEnd < 3 ? "note-warn"
        : monthsAtEnd < 6 ? "note-safe"
        : "note-strong";
      card.className = [
        "month-note",
        healthClass,
        month.label === lowest.label ? "lowest" : ""
      ].filter(Boolean).join(" ");

      const monthName = document.createElement("div");
      monthName.className = "note-month";
      monthName.textContent = month.label;

      const balance = document.createElement("strong");
      const balanceText = yen(month.balance);
      // 1億円以上（"100,000,000円"=13文字〜）だけフォント縮小。
      // 100万〜千万円（10〜12文字）は通常サイズを維持してバランスを保つ。
      balance.className = "note-balance" + (balanceText.length > 12 ? " note-balance--sm" : "");
      balance.textContent = balanceText;

      const caption = document.createElement("div");
      caption.className = "note-caption";
      caption.textContent = "月末残高";

      const eventWrap = document.createElement("div");
      eventWrap.className = "note-events";

      if (events.length === 0) {
        const empty = document.createElement("span");
        empty.className = "note-empty";
        empty.textContent = "とくに予定なし";
        eventWrap.appendChild(empty);
      } else {
        events.forEach((event) => {
          const item = document.createElement("span");
          item.className = `note-event ${event.type}`;
          item.textContent = event.text;
          eventWrap.appendChild(item);
        });
      }

      card.appendChild(monthName);
      card.appendChild(balance);
      card.appendChild(caption);
      card.appendChild(eventWrap);
      // 色覚に依存せず「どの月が底か」を文字で示す（色強調＝.lowest と二重表示）
      if (month.label === lowest.label) {
        const minBadge = document.createElement("span");
        minBadge.className = "note-min-badge";
        minBadge.textContent = "最小";
        card.appendChild(minBadge);
      }
      container.appendChild(card);
    });
  });
}

function renderChart(input, projection) {
  clearChildren(elements.balanceChart);
  const narrowChart = typeof window !== "undefined" && window.matchMedia
    && window.matchMedia("(max-width: 640px)").matches;
  // モバイルは viewBox を実表示幅に近い小さめの座標系にする。
  // 横長1000を狭幅へ押し込むと軸金額・月名・目安ラベルが約0.37倍に潰れて判読不能になるため、
  // 幅460・専用padding＋金額を「万」表記にして、文字を実寸で読めるサイズに保つ。
  const width = narrowChart ? 460 : 1000;
  const height = narrowChart ? 380 : 400;
  // 狭幅は右マージンに目安ラベルを置かず（線の左端上に重ねる）、本体に幅を使う＝右paddingを小さく。
  const padding = narrowChart
    ? { top: 22, right: 26, bottom: 38, left: 60 }
    : { top: 36, right: 150, bottom: 54, left: 78 };
  // モバイルの金額ラベルは「万」表記（例: 1,680,000 → 168万）で横幅を圧縮し読みやすく。
  const toMan = (v) => {
    const man = Math.round(v / 10000);
    return man === 0 ? "0" : `${man.toLocaleString("ja-JP")}万`;
  };
  const fmtAxis = narrowChart ? toMan : yen;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const target3 = input.monthlyExpense > 0 ? input.monthlyExpense * 3 : 0;
  const target6 = input.monthlyExpense > 0 ? input.monthlyExpense * 6 : 0;
  const balances = projection.map((month) => month.balance);
  const guideValues = [0, target3, target6].filter((value) => Number.isFinite(value));
  const minValue = Math.min(...balances, ...guideValues);
  const maxValue = Math.max(...balances, ...guideValues, 1);
  const range = maxValue - minValue || 1;
  const lowest = domain.findLowestBalanceMonth(projection);
  const xFor = (index) => padding.left + (index / Math.max(projection.length - 1, 1)) * plotWidth;
  const yFor = (value) => padding.top + ((maxValue - value) / range) * plotHeight;
  const linePoints = projection.map((month, index) => `${xFor(index).toFixed(1)},${yFor(month.balance).toFixed(1)}`);
  const areaPath = [
    `M ${xFor(0).toFixed(1)} ${height - padding.bottom}`,
    `L ${linePoints.join(" L ")}`,
    `L ${xFor(projection.length - 1).toFixed(1)} ${height - padding.bottom}`,
    "Z"
  ].join(" ");
  const linePath = `M ${linePoints.join(" L ")}`;
  const svg = appendSvg(elements.balanceChart, "svg", {
    class: "chart-svg",
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "12ヶ月の月末残高の線グラフ"
  });

  appendSvg(svg, "path", { class: "chart-area", d: areaPath });
  // 左Y軸: 上端＝最高残高、下端＝最低残高の金額を表示（縦のスケールを読めるように）
  appendSvg(svg, "text", { class: "chart-axis-label", x: padding.left - 8, y: (padding.top + 4).toFixed(1) }, fmtAxis(maxValue));
  appendSvg(svg, "text", { class: "chart-axis-label", x: padding.left - 8, y: (height - padding.bottom + 4).toFixed(1) }, fmtAxis(minValue));
  [0, target3, target6].forEach((value, index) => {
    if (!Number.isFinite(value)) return;
    const y = yFor(value);
    const label = index === 0 ? "0円" : index === 1 ? "3ヶ月分" : "6ヶ月分";
    appendSvg(svg, "line", {
      class: `chart-guide guide-${index}`,
      x1: padding.left,
      x2: width - padding.right,
      y1: y.toFixed(1),
      y2: y.toFixed(1)
    });
    if (narrowChart) {
      // 狭幅: 目安線の左端・線の上に「6ヶ月分 168万」を1行で載せる（右マージン不要＝本体が広く使える）
      const inlineLabel = index === 0 ? label : `${label} ${fmtAxis(value)}`;
      appendSvg(svg, "text", {
        class: "chart-guide-label",
        x: (padding.left + 6).toFixed(1),
        y: (y - 5).toFixed(1)
      }, inlineLabel);
    } else {
      appendSvg(svg, "text", {
        class: "chart-guide-label",
        x: width - padding.right + 10,
        y: (y - 1).toFixed(1)
      }, label);
      // 目安線の実際の金額も併記（何を基準に何ヶ月分かが分かるように）
      if (index > 0) {
        appendSvg(svg, "text", {
          class: "chart-guide-sub",
          x: width - padding.right + 10,
          y: (y + 11).toFixed(1)
        }, fmtAxis(value));
      }
    }
  });

  appendSvg(svg, "path", { class: "chart-line", d: linePath });

  const tipW = 148, tipH = 46;
  const tipEl = document.createElementNS(SVG_NS, "g");
  tipEl.setAttribute("class", "chart-tooltip");
  tipEl.setAttribute("visibility", "hidden");
  tipEl.setAttribute("aria-hidden", "true");
  const tipBg = document.createElementNS(SVG_NS, "rect");
  tipBg.setAttribute("class", "chart-tooltip-bg");
  tipBg.setAttribute("width", String(tipW));
  tipBg.setAttribute("height", String(tipH));
  tipBg.setAttribute("rx", "6");
  tipEl.appendChild(tipBg);
  const tipMonth = document.createElementNS(SVG_NS, "text");
  tipMonth.setAttribute("class", "chart-tooltip-month");
  tipMonth.setAttribute("x", String(tipW / 2));
  tipMonth.setAttribute("y", "16");
  tipEl.appendChild(tipMonth);
  const tipAmount = document.createElementNS(SVG_NS, "text");
  tipAmount.setAttribute("class", "chart-tooltip-amount");
  tipAmount.setAttribute("x", String(tipW / 2));
  tipAmount.setAttribute("y", "35");
  tipEl.appendChild(tipAmount);

  function showTip(x, y, label, balance) {
    let tx = x - tipW / 2;
    let ty = y - tipH - 10;
    if (tx < 0) tx = 0;
    if (tx + tipW > width) tx = width - tipW;
    if (ty < padding.top) ty = y + 12;
    tipEl.setAttribute("transform", `translate(${tx.toFixed(1)},${ty.toFixed(1)})`);
    tipMonth.textContent = label;
    tipAmount.textContent = yen(balance);
    tipEl.setAttribute("visibility", "visible");
  }
  function hideTip() { tipEl.setAttribute("visibility", "hidden"); }

  projection.forEach((month, index) => {
    const isLowest = month.label === lowest.label && month.balance === lowest.balance;
    const x = xFor(index);
    const y = yFor(month.balance);

    const pg = appendSvg(svg, "g", {
      class: "chart-point",
      tabindex: "0",
      role: "img",
      "aria-label": `${month.label} 月末残高 ${yen(month.balance)}`
    });
    appendSvg(pg, "circle", {
      class: isLowest ? "chart-dot lowest" : "chart-dot",
      cx: x.toFixed(1), cy: y.toFixed(1),
      r: isLowest ? 5 : 4
    });
    appendSvg(pg, "circle", {
      class: "chart-dot-hit",
      cx: x.toFixed(1), cy: y.toFixed(1),
      r: "14"
    });

    pg.addEventListener("mouseenter", () => showTip(x, y, month.label, month.balance));
    pg.addEventListener("mouseleave", hideTip);
    pg.addEventListener("focus", () => showTip(x, y, month.label, month.balance));
    pg.addEventListener("blur", hideTip);

    if (index % 2 === 0 || index === projection.length - 1) {
      appendSvg(svg, "text", {
        class: "chart-month-label",
        x: x.toFixed(1),
        y: height - 14
      }, `${month.label.slice(5)}月`);
    }
  });

  svg.appendChild(tipEl);

  const lowestLabel = document.createElement("p");
  lowestLabel.className = lowest.balance < 0 ? "chart-lowest-label negative" : "chart-lowest-label";
  lowestLabel.textContent = `いちばん少ない月: ${lowest.label} ${yen(lowest.balance)}`;
  elements.balanceChart.appendChild(lowestLabel);
  elements.chartCaption.textContent = "月末残高の流れ";
}

function renderProjection(projection) {
  clearChildren(elements.projectionRows);

  projection.forEach((month) => {
    const row = document.createElement("tr");
    appendCell(row, month.label);
    appendCell(row, yen(month.income), "positive");
    appendCell(row, yen(month.expense));
    appendCell(row, yen(month.balance), month.balance < 0 ? "negative" : "positive");
    elements.projectionRows.appendChild(row);
  });
}

function setApplyEnabled(enabled) {
  if (!elements.applyButton) return;
  elements.applyButton.disabled = !enabled;
  if (elements.applyHint) {
    elements.applyHint.textContent = enabled
      ? "入力すると自動で計算します。「まとめを見る」で結果の位置へスクロールします。"
      : "現金・手取り・生活費のどれかを入れると、自動で計算します。";
  }
}

function update({ commitLayout = false } = {}) {
  const input = readInput();
  // 3入力（現金・手取り・生活費）が揃って初めてレイアウトシフト・結果表示・buy-check 出現
  const rawCash = document.querySelector("#currentCash").value.trim();
  const rawIncome = document.querySelector("#monthlyIncome").value.trim();
  const rawExpense = document.querySelector("#monthlyExpense").value.trim();
  const basicsReady = rawCash !== "" && rawIncome !== "" && rawExpense !== "";
  const partialInput = !basicsReady && (rawCash !== "" || rawIncome !== "" || rawExpense !== "");
  if (elements.basicsHint) elements.basicsHint.hidden = !partialInput;
  // 空状態は入力フォームを中央に、入力後は右の従カラムへ（grid列幅をbodyクラスで補間）
  // レイアウトシフトは3つ目フィールドのblurまで遅延させる（入力中に右へ流れないよう）
  // results-column は app-empty 中は opacity:0/max-height:0 で非表示 → blur で外れた瞬間フェードイン
  if (!basicsReady) {
    document.body.classList.add("app-empty");
  } else if (commitLayout || !document.body.classList.contains("app-empty")) {
    document.body.classList.remove("app-empty");
  }
  const layoutCommitted = !document.body.classList.contains("app-empty");
  // buy-check は layout commit 後に出す。commit 前に出すと、そこへフォーカスが移った瞬間
  // 3つ目フィールドの blur が発火し、commitLayout: true になってアニメーションが走る
  if (elements.buyCheckSection) {
    const buyCheckReady = basicsReady && layoutCommitted;
    elements.buyCheckSection.classList.toggle("is-revealed", buyCheckReady);
    elements.buyCheckSection.inert = !buyCheckReady;
  }
  if (!basicsReady) {
    setApplyEnabled(false);
    renderBlank();
    return;
  }
  setApplyEnabled(true);

  const projection = domain.calculateProjection(input);
  renderStatus(input, projection);

  // 生活費（毎月支出）が確定するまでは、付箋・グラフ・金額表を空にする。
  // 収入0・支出0の平坦な残高をそのまま見せると、意味のある試算に見えてしまうため。
  if (input.monthlyExpense > 0) {
    renderMonthNotes(projection, input);
    renderChart(input, projection);
    renderProjection(projection);
  } else {
    clearChildren(elements.monthNotes);
    clearChildren(elements.balanceChart);
    clearChildren(elements.projectionRows);
    elements.chartCaption.textContent = "線が下がる月ほど現金が少ない月です";
  }
}

renderMonthInputs();
setActiveView("now");
update();

elements.form.addEventListener("input", update);
elements.form.addEventListener("blur", (event) => {
  if (event.target.matches("[data-amount-input]")) {
    formatAmountField(event.target);
    const isBasicField = ["currentCash", "monthlyIncome", "monthlyExpense"].includes(event.target.id);
    update({ commitLayout: isBasicField });
  }
}, true);
const extraMonths = document.querySelector("#extra-months");
const extraMonthsDone = document.querySelector("#extraMonthsDone");

function closeExtraMonths() {
  if (extraMonths) extraMonths.open = false;
}

if (extraMonthsDone) {
  extraMonthsDone.addEventListener("click", closeExtraMonths);
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && extraMonths && extraMonths.open) closeExtraMonths();
});

document.addEventListener("click", (e) => {
  if (extraMonths && extraMonths.open && !extraMonths.contains(e.target)) closeExtraMonths();
});

document.querySelector("#resetButton").addEventListener("click", (event) => {
  if (!window.confirm("入力内容をすべて消しますか？")) {
    event.preventDefault();
  }
});
elements.form.addEventListener("reset", () => {
  window.setTimeout(() => {
    update();
    const extraMonths = document.querySelector("#extra-months");
    if (extraMonths) extraMonths.open = false;
  }, 0);
});
elements.applyButton.addEventListener("click", () => {
  formatAllAmountFields();
  update({ commitLayout: true });
  // ボタン文言「まとめを見る」と挙動を一致させる：他タブを開いていても『まとめ』へ戻してからスクロール
  setActiveView("now");
  // 反映後、結果が入力欄の下に隠れて見えない問題への対応：結果へスクロール
  if (elements.resultsBoard && elements.resultsBoard.classList.contains("has-result")) {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    elements.resultsBoard.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }
});
window.addEventListener("pageshow", () => update({ commitLayout: true }));

// 結果のコピー（クリップボードのみ・外部送信なし）。金額の実額は含めず「何ヶ月分か」だけを共有可能に。
const copyResultButton = document.querySelector("#copyResultButton");
const copyResultMsg = document.querySelector("#copyResultMsg");
if (copyResultButton) {
  copyResultButton.addEventListener("click", async () => {
    const monthsEl = document.querySelector("#monthsBadge");
    const months = (monthsEl && monthsEl.textContent || "").trim();
    if (!months || months.includes("--")) {
      if (copyResultMsg) copyResultMsg.textContent = "先に3つ入力してください";
      return;
    }
    const text = `いまの現金は生活費の${months}（ふところ.com で試算 / 保存も送信もなし）`;
    try {
      await navigator.clipboard.writeText(text);
      if (copyResultMsg) copyResultMsg.textContent = "コピーしました";
    } catch {
      if (copyResultMsg) copyResultMsg.textContent = "コピーできませんでした";
    }
  });
}

// ── 同年代ベンチマーク（送信なし・ブラウザ内計算・任意オプトイン）────────────
// 公的統計(benchmark.js)を内蔵し、選んだ区分から「同年代・同世帯との比較」をローカル計算する。
// percentileは中央値・平均からの推計目安として折りたたみ表示し、below は前進フレームで見せる。
function setupBenchmark() {
  const B = window.FutokoroBenchmark;
  if (!B || !elements.bmAge) return;
  const fill = (sel, buckets) => {
    if (!sel) return;
    sel.innerHTML = "";
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = "選択してください";
    sel.appendChild(ph);
    buckets.forEach((bucket) => {
      const opt = document.createElement("option");
      opt.value = bucket.key;
      opt.textContent = bucket.label;
      sel.appendChild(opt);
    });
  };
  fill(elements.bmAge, B.AGE_BUCKETS);
  fill(elements.bmHousehold, B.HOUSEHOLD_BUCKETS);
  fill(elements.bmAsset, B.ASSET_BUCKETS);
  if (elements.bmSource) elements.bmSource.textContent = `出典: ${B.SOURCE_NAME}`;

  const yenMan = (man) => `${Math.round(man).toLocaleString("ja-JP")}万円`;

  function renderBenchmarkResult() {
    const res = elements.bmResult;
    if (!res) return;
    const ageKey = elements.bmAge.value;
    const household = elements.bmHousehold.value;
    const assetKey = elements.bmAsset.value;
    if (!ageKey || !household || !assetKey) {
      res.hidden = false;
      res.className = "benchmark-result benchmark-result--hint";
      res.textContent = "「年代」「世帯」「金融資産」の3つを選ぶと、同年代との比較が出ます。";
      return;
    }
    const assetBucket = B.ASSET_BUCKETS.find((b) => b.key === assetKey);
    const cmp = B.compareToPeers({ assetMan: assetBucket.mid, household, ageKey });
    if (!cmp) {
      res.hidden = false;
      res.className = "benchmark-result benchmark-result--hint";
      res.textContent = "この条件の比較データが見つかりませんでした。";
      return;
    }
    const ageLabel = B.AGE_BUCKETS.find((b) => b.key === ageKey).label;
    const hhLabel = B.HOUSEHOLD_BUCKETS.find((b) => b.key === household).label;
    const above = cmp.position === "above";
    // above/below を断定的に出さず前進フレームで（同年代より下でも「落ち込ませない」）。
    const headline = above
      ? "同年代の中央値と同じか、それ以上の水準です。"
      : "ここを出発点に、これからの現金の動きを一緒に確認していきましょう。";
    const pctLine = (cmp.percentile != null)
      ? '<details class="benchmark-pct"><summary>参考の目安（推計）</summary>'
        + `<p>同じ条件の中で、おおよそ上位 約${cmp.percentile}% の位置です。`
        + '<span class="benchmark-caveat">※公表されている中央値・平均値から推計した目安です。実際の順位とは異なります（区分の代表値で計算しています）。</span></p></details>'
      : "";
    res.hidden = false;
    res.className = above ? "benchmark-result is-above" : "benchmark-result is-below";
    res.innerHTML =
      `<p class="benchmark-headline">${headline}</p>`
      + `<p class="benchmark-compare">${ageLabel}・${hhLabel}の金融資産の中央値は <strong>${yenMan(cmp.median)}</strong>。`
      + `あなたが選んだ区分は <strong>${assetBucket.label}</strong> です。</p>`
      + pctLine;
  }

  if (elements.bmCompareButton) {
    elements.bmCompareButton.addEventListener("click", renderBenchmarkResult);
  }
}
setupBenchmark();
const tabList = Array.from(elements.viewTabs);
tabList.forEach((tab, index) => {
  tab.addEventListener("click", () => setActiveView(tab.dataset.viewTab));
  // WAI-ARIA タブパターン: 矢印/Home/Endでフォーカス移動＋切替（キーボードだけで全タブ操作可）
  tab.addEventListener("keydown", (event) => {
    let nextIndex = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % tabList.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + tabList.length) % tabList.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabList.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = tabList[nextIndex];
    setActiveView(nextTab.dataset.viewTab);
    nextTab.focus();
  });
});
if (elements.sampleButton) {
  elements.sampleButton.addEventListener("click", () => {
    document.querySelector("#currentCash").value = "1,200,000";
    document.querySelector("#monthlyIncome").value = "380,000";
    document.querySelector("#monthlyExpense").value = "280,000";
    // 見本：数ヶ月先に大きな出費を1件入れ、付箋・残高グラフに谷ができる様子と「最小」月を見せる
    document.querySelectorAll(".month-field").forEach((field) => { field.value = ""; });
    const sampleSpend = document.querySelector('.month-field[data-kind="extraExpense"][data-index="3"]');
    if (sampleSpend) sampleSpend.value = "500,000";
    const buyAmountEl = document.querySelector("#buyAmount");
    if (buyAmountEl) buyAmountEl.value = "350,000";
    formatAllAmountFields();
    update({ commitLayout: true });
    // 注入した大きな出費は付箋・残高グラフ・最小バッジ・まとめの「いちばん薄い月」に反映される。
    // 入力モーダル（extra-months）は自動で開かない：見本の目的は結果を見せること。
  });
}

// 「これ買える？」判定（この端末だけで計算・送信なし）
const buyAmountField = document.querySelector("#buyAmount");
const buyWhenField = document.querySelector("#buyWhen");
const buyCheckButton = document.querySelector("#buyCheckButton");
const buyResult = document.querySelector("#buyResult");
const buyVerdict = document.querySelector("#buyVerdict");
const buyReason = document.querySelector("#buyReason");

function populateBuyWhen() {
  if (!buyWhenField) return;
  for (let i = 0; i < MONTH_COUNT; i += 1) {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = i === 0 ? `今月（${monthLabel(0)}）` : monthLabel(i);
    buyWhenField.appendChild(option);
  }
}

function showBuyResult(key, head, detail) {
  buyVerdict.textContent = head;
  buyVerdict.className = key ? `buy-verdict ${key}` : "buy-verdict";
  buyReason.textContent = detail;
  buyResult.hidden = false;
  // 判定ボタンを押したら、結果が画面外（特にスマホで入力の下）に隠れないよう結果までスクロール
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  buyResult.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
}

function runBuyCheck() {
  try {
    const input = readInput();
    if (buyAmountField) {
      buyAmountField.value = formatAmountValue(buyAmountField.value, MONTHLY_AMOUNT_MAX);
    }
    const amount = parseAmount(buyAmountField ? buyAmountField.value : "", MONTHLY_AMOUNT_MAX);

    if (input.monthlyExpense <= 0 || input.currentCash <= 0) {
      showBuyResult("", "", "先に右の「まず3つだけ」フォームで「いまの現金・預金」と「毎月の生活費」を入力してください。");
      return;
    }
    if (amount <= 0) {
      showBuyResult("", "", "ほしいモノの値段を入れてください。");
      return;
    }

    const whenIndex = Math.min(Math.max(Number(buyWhenField && buyWhenField.value) || 0, 0), MONTH_COUNT - 1);
    const whenLabel = whenIndex === 0 ? "今月" : monthLabel(whenIndex);

    // 購入分を該当月の臨時支出に上乗せして、購入前後の12ヶ月推移を比較（既存ロジックを再利用）
    const afterInput = {
      ...input,
      months: input.months.map((month, index) =>
        index === whenIndex ? { ...month, extraExpense: month.extraExpense + amount } : { ...month }
      )
    };
    const before = domain.calculateProjection(input);
    const after = domain.calculateProjection(afterInput);
    const beforeLowest = domain.findLowestBalanceMonth(before);
    const afterLowest = domain.findLowestBalanceMonth(after);
    if (!afterLowest || !beforeLowest) {
      showBuyResult("", "", "計算できませんでした。入力を確認してください。");
      return;
    }
    const buyMonthBalance = after[whenIndex].balance; // 購入した月の月末残高（選んだ月で変わる）
    const floor3 = input.monthlyExpense * 3;

    if (afterLowest.balance < 0) {
      showBuyResult(
        "danger",
        "購入後、残高がマイナスになります",
        `${whenLabel}に${yen(amount)}を使うと、${afterLowest.label}の残高が${yen(afterLowest.balance)}になります。時期をずらすか、分けて購入すると余裕が生まれます。`
      );
      return;
    }

    // すでに買う前から3ヶ月分を下回っている場合は、それを先に伝える（買い物のせいだと誤解させない）
    if (beforeLowest.balance < floor3) {
      showBuyResult(
        "warn",
        "購入前の現状をご確認ください",
        `購入前から、いちばん薄い${beforeLowest.label}が${yen(beforeLowest.balance)}で生活費3ヶ月分（${yen(floor3)}）を下回っています。${whenLabel}に購入すると${yen(buyMonthBalance)}になります。`
      );
      return;
    }

    if (afterLowest.balance < floor3) {
      const shortfall = floor3 - afterLowest.balance;
      showBuyResult(
        "warn",
        "購入後、3ヶ月目安を下回ります",
        `${whenLabel}に${yen(amount)}を使うと、いちばん薄い${afterLowest.label}が${yen(afterLowest.balance)}まで下がり、生活費3ヶ月分（${yen(floor3)}）を割ります。あと${yen(shortfall)}の余裕ができてからにするか、時期をずらす・分けて買うと3ヶ月分を保てます。`
      );
      return;
    }

    showBuyResult(
      "safe",
      "購入後も3ヶ月分の備えを維持できます",
      `${whenLabel}に${yen(amount)}を使っても、いちばん薄い${afterLowest.label}で${yen(afterLowest.balance)}を維持。生活費3ヶ月分（${yen(floor3)}）を下回らない試算です。`
    );
  } catch (err) {
    showBuyResult("", "", "計算でエラーが起きました。入力を確認して、もう一度お試しください。");
  }
}

populateBuyWhen();
if (buyCheckButton) buyCheckButton.addEventListener("click", runBuyCheck);
if (buyAmountField) {
  buyAmountField.addEventListener("blur", () => {
    buyAmountField.value = formatAmountValue(buyAmountField.value, MONTHLY_AMOUNT_MAX);
  });
}

// ===== 記録の保存・読み込み（手元ファイルへ書き出し／読み込み・送信なし・localStorage不使用） =====
const io = window.LifeDefenseIO;
const ioElements = {
  exportJson: document.querySelector("#exportJsonButton"),
  importJson: document.querySelector("#importJsonInput"),
  exportCsv: document.querySelector("#exportCsvButton"),
  importCsv: document.querySelector("#importCsvInput"),
  message: document.querySelector("#ioMessage")
};

function ioMessage(text, kind) {
  if (!ioElements.message) return;
  ioElements.message.textContent = text || "";
  ioElements.message.className = "io-message" + (kind ? ` ${kind}` : "");
}

// 安全に正規化済みの input をフォームへ反映して再計算する
function applyInputToForm(input) {
  const setVal = (selector, value) => {
    const el = document.querySelector(selector);
    if (el) el.value = value > 0 ? String(value) : "";
  };
  setVal("#currentCash", input.currentCash);
  setVal("#monthlyIncome", input.monthlyIncome);
  setVal("#monthlyExpense", input.monthlyExpense);
  let hasFutureMonth = false;
  input.months.forEach((month, index) => {
    const expEl = document.querySelector(`.month-field[data-kind="extraExpense"][data-index="${index}"]`);
    const incEl = document.querySelector(`.month-field[data-kind="extraIncome"][data-index="${index}"]`);
    if (expEl) expEl.value = month.extraExpense > 0 ? String(month.extraExpense) : "";
    if (incEl) incEl.value = month.extraIncome > 0 ? String(month.extraIncome) : "";
    if (month.extraExpense > 0 || month.extraIncome > 0) hasFutureMonth = true;
  });
  // 来月以降に値があれば、隠れている入力欄を開いて見せる
  const extraMonthsPanel = document.querySelector("#extra-months");
  if (extraMonthsPanel && hasFutureMonth) extraMonthsPanel.open = true;
  formatAllAmountFields();
  update({ commitLayout: true });
}

function downloadTextFile(filename, mime, text) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fileTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function readFileAsText(file, maxBytes, onText) {
  if (!file) return;
  if (file.size > maxBytes) {
    ioMessage("ファイルが大きすぎます。ふところで書き出したファイルを選んでください。", "error");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      onText(String(reader.result || ""));
    } catch (err) {
      ioMessage(err && err.message ? err.message : "読み込みに失敗しました。", "error");
    }
  };
  reader.onerror = () => ioMessage("ファイルの読み込みに失敗しました。", "error");
  reader.readAsText(file);
}

if (io && ioElements.exportJson) {
  ioElements.exportJson.addEventListener("click", () => {
    try {
      const text = io.toJson(readInput(), new Date().toISOString());
      downloadTextFile(`futokoro-${fileTimestamp()}.json`, "application/json", text);
      ioMessage("入力を書き出しました（この端末のダウンロードへ・送信なし）。", "ok");
    } catch (_e) {
      ioMessage("書き出しに失敗しました。", "error");
    }
  });
}
if (io && ioElements.importJson) {
  ioElements.importJson.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    readFileAsText(file, io.MAX_IMPORT_BYTES, (text) => {
      applyInputToForm(io.parseImportText(text));
      ioMessage("読み込んで復元しました。", "ok");
    });
    event.target.value = "";
  });
}
if (io && ioElements.exportCsv) {
  ioElements.exportCsv.addEventListener("click", () => {
    try {
      const labels = Array.from({ length: MONTH_COUNT }, (_, i) => monthLabel(i));
      const text = io.toCsv(readInput(), labels);
      downloadTextFile(`futokoro-${fileTimestamp()}.csv`, "text/csv;charset=utf-8", text);
      ioMessage("CSVを書き出しました（Excel等で開けます・送信なし）。", "ok");
    } catch (_e) {
      ioMessage("CSVの書き出しに失敗しました。", "error");
    }
  });
}
if (io && ioElements.importCsv) {
  ioElements.importCsv.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    readFileAsText(file, io.MAX_IMPORT_BYTES, (text) => {
      applyInputToForm(io.parseCsv(text));
      ioMessage("CSVを読み込んで復元しました。", "ok");
    });
    event.target.value = "";
  });
}
