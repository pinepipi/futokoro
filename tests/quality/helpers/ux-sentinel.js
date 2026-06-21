// UX センチネル — 「操作の途中」を観測するための計器。
// 完成後スクショ/DOMスナップショットでは映らない、入力中の focus移動・要素のreveal・
// transition開始・layout-shift を時系列で記録する。interaction-contract テストの証拠源。
//
// 使い方: openApp の前に installUxSentinel(page) を呼ぶ（addInitScript は次の goto に適用される）。
// 取得: const events = await readUxEvents(page);

async function installUxSentinel(page) {
  await page.addInitScript(() => {
    const log = [];
    window.__uxEvents = log;
    const id = (el) =>
      (el && (el.id || el.name || el.getAttribute?.("data-kind") || el.className || el.tagName)) || "(unknown)";

    // focus がどこへ行ったか（勝手に奪われていないか）
    document.addEventListener(
      "focusin",
      (e) => log.push({ type: "focusin", target: id(e.target), t: performance.now() }),
      true
    );
    document.addEventListener(
      "focusout",
      (e) => log.push({ type: "focusout", target: id(e.target), t: performance.now() }),
      true
    );
    // CSS トランジション/アニメの「開始」— 入力中フェーズで走ったらアウト
    document.addEventListener(
      "transitionstart",
      (e) => log.push({ type: "transitionstart", target: id(e.target), property: e.propertyName, t: performance.now() }),
      true
    );
    document.addEventListener(
      "animationstart",
      (e) => log.push({ type: "animationstart", target: id(e.target), name: e.animationName, t: performance.now() }),
      true
    );
    // class / hidden / inert / aria-hidden の変化（要素が「ペロンと出た」瞬間を捕まえる）
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type !== "attributes") continue;
        log.push({
          type: "attr-change",
          target: id(r.target),
          attr: r.attributeName,
          value: r.target.getAttribute?.(r.attributeName),
          className: r.target.className,
          t: performance.now(),
        });
      }
    }).observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "hidden", "inert", "aria-hidden"],
    });
    // layout-shift は CLS値ではなく「イベントそのもの」を記録する。
    // hadRecentInput が true だと CLS から除外されるため、CLSスコアだけ見ると入力直後のシフトを見逃す。
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          log.push({
            type: "layout-shift",
            value: entry.value,
            hadRecentInput: entry.hadRecentInput,
            t: performance.now(),
            sources: (entry.sources || []).map((s) => ({
              node: id(s.node),
              from: s.previousRect,
              to: s.currentRect,
            })),
          });
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {
      /* layout-shift 未対応ブラウザは無視 */
    }
  });
}

async function readUxEvents(page) {
  return page.evaluate(() => window.__uxEvents || []);
}

async function clearUxEvents(page) {
  await page.evaluate(() => {
    if (window.__uxEvents) window.__uxEvents.length = 0;
  });
}

module.exports = { installUxSentinel, readUxEvents, clearUxEvents };
