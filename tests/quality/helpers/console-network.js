// console error/warn と network 4xx/5xx を収集して fail 判定するヘルパー。
// このアプリは「外部送信ゼロ」が正なので、想定外の network 発火自体も検出対象。

// 許容する console メッセージ（substring 一致）。安易に増やさない。
const CONSOLE_ALLOWLIST = [
  // 例: 既知の無害な警告があればここに ID コメント付きで追加
];

// 外部送信ゼロ境界: ローカル file:// 配信以外への request は原則 NG。
// （ads.js は既定 hidden で発火しないが、万一の外部接続を検出する）
function isAllowedRequestUrl(url) {
  return url.startsWith("file://") || url.startsWith("data:") || url.startsWith("blob:");
}

// page に監視を仕掛け、収集オブジェクトを返す。テスト末尾で assertClean を呼ぶ。
function attachConsoleNetwork(page) {
  const collected = { consoleErrors: [], consoleWarnings: [], badResponses: [], externalRequests: [], pageErrors: [] };

  page.on("console", (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (CONSOLE_ALLOWLIST.some((a) => text.includes(a))) return;
    if (type === "error") collected.consoleErrors.push(text);
    else if (type === "warning") collected.consoleWarnings.push(text);
  });

  page.on("pageerror", (err) => {
    collected.pageErrors.push(String(err && err.message ? err.message : err));
  });

  page.on("response", (res) => {
    const status = res.status();
    if (status >= 400) collected.badResponses.push(`${status} ${res.url()}`);
  });

  page.on("request", (req) => {
    const url = req.url();
    if (!isAllowedRequestUrl(url)) collected.externalRequests.push(url);
  });

  return collected;
}

// 収集結果を issue 配列へ（severity 付き）。空なら clean。
function toIssues(collected) {
  const issues = [];
  collected.pageErrors.forEach((e) => issues.push({ type: "page-error", severity: "P0", detail: e }));
  collected.consoleErrors.forEach((e) => issues.push({ type: "console-error", severity: "P1", detail: e }));
  collected.badResponses.forEach((e) => issues.push({ type: "network-4xx5xx", severity: "P1", detail: e }));
  collected.externalRequests.forEach((e) => issues.push({ type: "external-request", severity: "P0", detail: e }));
  // warning は P2（記録のみ・fail にしない）
  collected.consoleWarnings.forEach((e) => issues.push({ type: "console-warning", severity: "P2", detail: e }));
  return issues;
}

module.exports = { attachConsoleNetwork, toIssues, CONSOLE_ALLOWLIST, isAllowedRequestUrl };
