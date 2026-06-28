// 画面崩れ検出 — overflow / text clipping / button overflow / 横スクロール / 要素重なり
// 「人が見れば一発でわかる崩れ」を functional test とは別に機械検出する（研究: Nighthawk 系の発想）。
// page.evaluate でブラウザ内を走査し、issue 配列を返す。重大度は呼び出し側で判定。

// ページ内で実行する崩れスキャナ（DOMに依存するため文字列関数として注入）
function scanLayoutInPage() {
  const issues = [];
  const docEl = document.documentElement;

  // clientWidth はスクロールバーを除いたコンテンツ幅（innerWidth はバー幅を含み±15px揺れる）
  const vw = docEl.clientWidth;

  // 1. 横スクロール（ページ全体が実際にスクロールする）
  const overflowX = docEl.scrollWidth - docEl.clientWidth;
  const hasHorizontalScroll = overflowX > 2;
  if (hasHorizontalScroll) {
    issues.push({
      type: "horizontal-scroll",
      severity: "P1",
      region: "document",
      detail: `scrollWidth ${docEl.scrollWidth} > clientWidth ${docEl.clientWidth} (+${overflowX}px)`,
    });
  }
  const isVisible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return false;
    // ユーザーに見えない領域は崩れ判定から除外（誤検出の主因）:
    //  - 閉じた <details> の summary 以外の中身
    //  - [hidden] / aria-hidden="true" 配下（非アクティブタブ・装飾SVG等）
    const closedDetails = el.closest("details:not([open])");
    if (closedDetails && !el.closest("summary")) return false;
    if (el.closest("[hidden]") || el.closest('[aria-hidden="true"]')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // 2. 要素が viewport をはみ出す（見切れ）。
  //    実際に横スクロールが起きている時のみ、その原因要素を特定する（高精度化）。
  //    横スクロールが無ければ「innerWidthをわずかに超える」のはスクロールバー会計ノイズなので拾わない
  //    （枠内クリップは別途 text-clipping で検出する）。
  if (hasHorizontalScroll) {
    document.querySelectorAll("button, a, h1, h2, h3, .months-badge, .metric-card, .note-summary-card, table, .projection-table").forEach((el) => {
      if (!isVisible(el)) return;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 8 || r.left < -8) {
        issues.push({
          type: "element-overflow",
          severity: "P1",
          region: el.id ? `#${el.id}` : el.className || el.tagName,
          detail: `rect right=${Math.round(r.right)} left=${Math.round(r.left)} vs content width ${vw}`,
        });
      }
    });
  }

  // 3. テキスト見切れ（要素の中身が幅を超え、overflow が clip/hidden で隠れている）
  document.querySelectorAll("button, .months-badge, .metric-card strong, .note-status-chip, h1, h2, h3, .buy-verdict").forEach((el) => {
    if (!isVisible(el)) return;
    const cs = getComputedStyle(el);
    const clipsX = cs.overflowX === "hidden" || cs.overflowX === "clip";
    // scrollWidth が clientWidth を明確に超える＝文字が切れている
    if (clipsX && el.scrollWidth - el.clientWidth > 2) {
      issues.push({
        type: "text-clipping",
        severity: "P1",
        region: el.id ? `#${el.id}` : el.className || el.tagName,
        detail: `scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth} ("${(el.textContent || "").trim().slice(0, 24)}")`,
      });
    }
  });

  // 4. 主要な操作要素どうしの「実際に視認上ぶつかっている」重なりだけを検出。
  //    naive な bbox 交差は誤検出が多い（別セクション・スクロール外の要素を拾う）。
  //    → 両要素が現ビューポート内にあり、重なり中心の elementFromPoint が
  //      どちらの要素（or その子孫）でもない＝相手を覆い隠している場合のみ崩れとみなす。
  const vh = window.innerHeight;
  const inViewport = (r) => r.top >= 0 && r.bottom <= vh && r.left >= 0 && r.right <= vw;
  const interactive = Array.from(document.querySelectorAll("button, a[href], input, select"))
    .filter(isVisible)
    .filter((el) => inViewport(el.getBoundingClientRect()));
  for (let i = 0; i < interactive.length; i++) {
    for (let j = i + 1; j < interactive.length; j++) {
      const a = interactive[i];
      const b = interactive[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const overlapX = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const overlapY = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (overlapX <= 4 || overlapY <= 4) continue;
      const overlapArea = overlapX * overlapY;
      const minArea = Math.min(ra.width * ra.height, rb.width * rb.height) || 1;
      if (overlapArea / minArea <= 0.35) continue;
      // 重なり中心で実際にどちらかが相手を覆っているか確認
      const cx = Math.max(ra.left, rb.left) + overlapX / 2;
      const cy = Math.max(ra.top, rb.top) + overlapY / 2;
      const top = document.elementFromPoint(cx, cy);
      if (!top) continue;
      const occludes = (host, other) => (host === top || host.contains(top)) && !other.contains(top) && top !== other;
      if (occludes(a, b) || occludes(b, a)) {
        issues.push({
          type: "overlap",
          severity: "P1",
          region: `${a.id ? "#" + a.id : a.tagName} ∩ ${b.id ? "#" + b.id : b.tagName}`,
          detail: `overlap ${Math.round((overlapArea / minArea) * 100)}% of smaller element`,
        });
      }
    }
  }

  return issues;
}

// page から崩れ issue 配列を取得
async function checkLayout(page) {
  return page.evaluate(`(${scanLayoutInPage.toString()})()`);
}

// レイアウトが落ち着くまで待つ。
// `.layout` の grid 列幅は app-empty 切替時に 0.45s かけて補間される（styles.css の
// transition: grid-template-columns）。この補間中に getBoundingClientRect を測ると、
// アニメーション途中フレームで主要要素が一時的に重なり、崩れを誤検出する（リセット導線で再発）。
// 主要要素の矩形が連続フレームで変化しなくなる＝トランジション完了まで待ってから判定する。
async function waitForLayoutStable(page, { settleFrames = 3, maxFrames = 90 } = {}) {
  await page.evaluate(
    ({ settleFrames, maxFrames }) =>
      new Promise((resolve) => {
        const sig = () =>
          Array.from(
            document.querySelectorAll(
              ".layout, .input-panel, .results-column, .side-column, .form-actions, button, input, select"
            )
          )
            .map((el) => {
              const r = el.getBoundingClientRect();
              return `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
            })
            .join("|");
        let last = null;
        let stable = 0;
        let frames = 0;
        const tick = () => {
          const s = sig();
          if (s === last) stable += 1;
          else {
            stable = 0;
            last = s;
          }
          frames += 1;
          if (stable >= settleFrames || frames >= maxFrames) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { settleFrames, maxFrames }
  );
}

module.exports = { checkLayout, scanLayoutInPage, waitForLayoutStable };
